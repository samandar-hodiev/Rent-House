// Command server is the RentHouse HTTP API entry point.
package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/samandar-hodiev/Rent-House/backend/internal/config"
	"github.com/samandar-hodiev/Rent-House/backend/internal/database"
	"github.com/samandar-hodiev/Rent-House/backend/internal/dto"
	"github.com/samandar-hodiev/Rent-House/backend/internal/handler"
	"github.com/samandar-hodiev/Rent-House/backend/internal/middleware"
	"github.com/samandar-hodiev/Rent-House/backend/internal/notify"
	"github.com/samandar-hodiev/Rent-House/backend/internal/realtime"
	"github.com/samandar-hodiev/Rent-House/backend/internal/repository"
	"github.com/samandar-hodiev/Rent-House/backend/internal/service"
	"github.com/samandar-hodiev/Rent-House/backend/internal/storage"

	"github.com/google/uuid"
	"github.com/samandar-hodiev/Rent-House/backend/internal/token"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/logger"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/response"
)

const (
	readHeaderTimeout = 10 * time.Second
	shutdownTimeout   = 10 * time.Second
)

func main() {
	if err := run(); err != nil {
		logger.Fatalf("startup failed: %v", err)
	}
}

// run owns the whole lifecycle and returns errors instead of exiting, so every
// failure path reports through one place in main.
func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	db, err := database.Connect(cfg.Database)
	if err != nil {
		return err
	}
	defer func() {
		if err := database.Close(db); err != nil {
			logger.Errorf("closing database: %v", err)
		}
	}()

	// Custom binding rules must be registered before the first request binds.
	if err := dto.RegisterValidators(); err != nil {
		return fmt.Errorf("register validators: %w", err)
	}

	tokens, err := token.New(cfg.JWT.Secret, cfg.JWT.ExpiresIn)
	if err != nil {
		return err
	}

	senders, err := buildSenders(cfg)
	if err != nil {
		return err
	}

	router, err := newRouter(cfg, db, tokens, senders)
	if err != nil {
		return err
	}

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           router,
		ReadHeaderTimeout: readHeaderTimeout,
	}

	// Serve until the process is asked to stop, then drain in-flight requests.
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	serverErr := make(chan error, 1)
	go func() {
		logger.Infof("http server listening on :%s", cfg.Port)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
			return
		}
		serverErr <- nil
	}()

	select {
	case err := <-serverErr:
		return err
	case <-ctx.Done():
		logger.Infof("shutdown signal received, draining connections")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		return server.Shutdown(shutdownCtx)
	}
}

// senders groups the two delivery channels.
type senders struct {
	sms   notify.Sender
	email notify.Sender
}

// buildSenders resolves the configured providers and says plainly, once, which
// channel is real and which only logs. A deployment that thinks it is sending
// SMS while writing to a log file is the failure mode worth being loud about.
func buildSenders(cfg *config.Config) (senders, error) {
	settings := notify.Settings{
		EmailProvider: cfg.Notify.EmailProvider,
		SMSProvider:   cfg.Notify.SMSProvider,
		Resend: notify.ResendConfig{
			APIKey:     cfg.Notify.ResendAPIKey,
			From:       cfg.Notify.ResendFrom,
			Subject:    cfg.Notify.ResendSubject,
			BodyFormat: cfg.Notify.ResendBody,
			BaseURL:    cfg.Notify.ResendBaseURL,
		},
		SMTP: notify.SMTPConfig{
			Host:       cfg.Notify.SMTPHost,
			Port:       cfg.Notify.SMTPPort,
			Username:   cfg.Notify.SMTPUsername,
			Password:   cfg.Notify.SMTPPassword,
			From:       cfg.Notify.SMTPFrom,
			Subject:    cfg.Notify.SMTPSubject,
			BodyFormat: cfg.Notify.SMTPBody,
		},
		Eskiz: notify.EskizConfig{
			Email:         cfg.Notify.EskizEmail,
			Password:      cfg.Notify.EskizPassword,
			From:          cfg.Notify.EskizFrom,
			MessageFormat: cfg.Notify.EskizMessage,
		},
	}

	emailSender, err := notify.BuildEmailSender(settings)
	if err != nil {
		return senders{}, fmt.Errorf("email provider: %w", err)
	}
	smsSender, err := notify.BuildSMSSender(settings)
	if err != nil {
		return senders{}, fmt.Errorf("sms provider: %w", err)
	}

	describe := func(channel, provider string) {
		if notify.IsDevelopment(provider) {
			logger.Infof(
				"%s delivery is DISABLED: codes are written to this log, not sent. "+
					"Set %s_PROVIDER to a real provider before production.", channel, channel)
			return
		}
		logger.Infof("%s delivery via %s", channel, provider)
	}
	if strings.TrimSpace(cfg.Notify.ResendBaseURL) != "" {
		logger.Infof("WARNING: RESEND_BASE_URL is set to %q — email is NOT going to Resend. "+
			"Unset it for real delivery.", cfg.Notify.ResendBaseURL)
	}
	describe("EMAIL", cfg.Notify.EmailProvider)
	describe("SMS", cfg.Notify.SMSProvider)

	return senders{sms: smsSender, email: emailSender}, nil
}

// newRouter wires dependencies, middleware and routes. Construction happens
// once at startup — handlers hold the collaborators they need rather than
// reaching for globals.
func newRouter(
	cfg *config.Config, db *gorm.DB, tokens *token.Service, delivery senders,
) (*gin.Engine, error) {
	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery(), middleware.CORS(cfg.AllowedOrigins))

	// Liveness probe: intentionally does not touch the database, so it answers
	// "the process is up" rather than "every dependency is up".
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// How the marketplace is configured. Built before anything is routed,
	// because the first thing every request meets is the check for whether the
	// marketplace is open at all. It is not an admin feature: the dashboard is
	// where the values are set, but it is the rest of the API that obeys them.
	settingsService := service.NewSettingsService(repository.NewSettingsRepository(db))

	v1 := router.Group("/api/v1", middleware.Maintenance(settingsService))

	// The site's own configuration: its name, the language it opens in, the
	// limits its forms must respect, and whether it is in maintenance. Public
	// because a visitor needs it before signing in, and exempt from the
	// maintenance check because it is what announces maintenance.
	v1.GET("/settings", handler.NewSettingsHandler(settingsService).Public)
	v1.GET("", func(c *gin.Context) {
		response.OK(c, "RentHouse API v1", nil)
	})

	// handler -> service -> repository -> database.
	users := repository.NewUserRepository(db)
	verifications := repository.NewVerificationRepository(db)

	// Which providers these are is decided by configuration in buildSenders;
	// the service only knows the interface.
	authService := service.NewAuthService(
		users, verifications, tokens,
		delivery.sms, delivery.email,
		cfg.OTP, settingsService, repository.NewLoginAttemptRepository(db),
	)
	// The first allowed origin is where the app is served from, and so where a
	// password-reset link must point.
	appOrigin := ""
	if len(cfg.AllowedOrigins) > 0 {
		appOrigin = cfg.AllowedOrigins[0]
	}
	authHandler := handler.NewAuthHandler(authService, appOrigin)

	auth := v1.Group("/auth")
	{
		// Public: a caller with no account cannot be asked for a token.
		// Registration is three steps, so ownership of the contact is proven
		// before an account exists.
		auth.POST("/register/request", authHandler.RequestRegistrationCode)
		auth.POST("/register/verify", authHandler.VerifyRegistrationCode)
		auth.POST("/register/complete", authHandler.CompleteRegistration)
		auth.POST("/login", authHandler.Login)

		// Protected.
		auth.GET("/me", middleware.Auth(tokens), authHandler.Me)

		// Password reset, by email. Public: somebody who has forgotten their
		// password has no token to present.
		auth.POST("/password/forgot", authHandler.ForgotPassword)
		auth.GET("/password/reset", authHandler.ValidateResetToken)
		auth.POST("/password/reset", authHandler.ResetPassword)
	}

	// Listings. Same layering as auth: handler -> service -> repository -> db.
	apartments := repository.NewApartmentRepository(db)

	// View events and the timelines built from them. The secret is used only to
	// derive the key that tells two anonymous visitors apart — see
	// NewAnalyticsService.
	analyticsService, err := service.NewAnalyticsService(
		repository.NewAnalyticsRepository(db), apartments, cfg.JWT.Secret,
	)
	if err != nil {
		return nil, fmt.Errorf("analytics: %w", err)
	}
	analyticsHandler := handler.NewAnalyticsHandler(analyticsService)

	apartmentHandler := handler.NewApartmentHandler(
		service.NewApartmentService(apartments, settingsService), analyticsService,
	)

	// One chat repository, shared: the chat service publishes messages through
	// it and the dashboard reads its unread total from it. Two instances would
	// be two connections to the same rows for no reason.
	chats := repository.NewChatRepository(db)
	// Who has blocked whom. Read by the send path and surfaced on every
	// conversation, so it is built once and shared.
	blocks := repository.NewBlockRepository(db)
	favoriteHandler := handler.NewFavoriteHandler(
		service.NewFavoriteService(repository.NewFavoriteRepository(db), apartments, chats),
	)

	// Reference data the owner form needs before it can submit anything.
	v1.GET("/districts", apartmentHandler.Districts)

	listings := v1.Group("/apartments")
	{
		// Public: browsing and searching need no account.
		listings.GET("", apartmentHandler.List)
		// Optional auth, not none: an owner opening their own unpublished
		// draft must see it, and nobody else may.
		listings.GET("/:id", middleware.OptionalAuth(tokens), apartmentHandler.Get)

		// Owner-only. The identity comes from the token; the service checks
		// that the listing is actually theirs before writing anything.
		listings.POST("", middleware.Auth(tokens), apartmentHandler.Create)
		listings.PUT("/:id", middleware.Auth(tokens), apartmentHandler.Update)
		listings.DELETE("/:id", middleware.Auth(tokens), apartmentHandler.Delete)
		// The listing's lifecycle, separate from editing its content: a status
		// change rewrites neither the gallery nor the description.
		listings.PATCH("/:id/status", middleware.Auth(tokens), apartmentHandler.ChangeStatus)

		// How many people looked at a listing is its owner's business, so this
		// one is authenticated even though the listing beside it is public.
		listings.GET("/:id/analytics", middleware.Auth(tokens), analyticsHandler.ApartmentViews)
	}

	// The signed-in user's own listings, in every status — this is the
	// dashboard, where a draft is exactly what they came to find.
	me := v1.Group("/me", middleware.Auth(tokens))
	{
		// The signed-in account's own profile. PATCH rather than PUT: a form
		// that leaves a field untouched must not erase it.
		me.PATCH("", authHandler.UpdateProfile)

		me.GET("/apartments", apartmentHandler.ListMine)
		me.GET("/apartments/stats", apartmentHandler.Stats)
		// The dashboard chart: every published listing this user owns, as one
		// timeline. Aggregated by PostgreSQL — the client receives totals, never
		// the underlying events.
		me.GET("/analytics/views", analyticsHandler.OwnerViews)

		// Saved apartments and the dashboard's first paint. The user is always
		// the one the token names, so there is no id here to tamper with.
		me.GET("/favorites", favoriteHandler.List)
		me.POST("/favorites/:apartmentId", favoriteHandler.Save)
		me.DELETE("/favorites/:apartmentId", favoriteHandler.Unsave)
		me.GET("/dashboard/summary", favoriteHandler.Summary)
	}

	// Listings that have been up longer than the marketplace allows. Started
	// only when something is there to sweep; the setting is off by default, so
	// this costs one query an hour until an owner turns it on.
	go service.NewListingExpiry(apartments, settingsService).Run(context.Background())

	// Uploaded files: listing photographs and chat attachments share one store.
	files, err := storage.NewLocalStorage(cfg.UploadDir, cfg.UploadPublicPath)
	if err != nil {
		return nil, fmt.Errorf("storage: %w", err)
	}

	// The dashboard, which is a separate system with separate accounts.
	//
	// Its own table, its own token audience and its own middleware: a signed-in
	// visitor's token is refused here, and an administrator's is refused by the
	// marketplace. Sharing one account table would mean the public registration
	// endpoint writes rows the admin authorization has to be careful about.
	adminService := service.NewAdminService(repository.NewAdminRepository(db), tokens, settingsService)
	// Every figure the dashboard shows is counted by PostgreSQL; this service
	// only shapes the counts into series.
	adminStats := service.NewAdminStatsService(repository.NewAdminStatsRepository(db), settingsService)
	// Read-only: an administrator inspects listings, and the owner's own
	// endpoints remain the only way to change one.
	adminListings := service.NewAdminListingService(
		repository.NewAdminListingRepository(db), apartments, settingsService,
	)
	adminHandler := handler.NewAdminHandler(
		adminService, adminStats, adminListings, settingsService,
		files, cfg.UploadPublicPath, cfg.PublicBaseURL,
	)

	admin := v1.Group("/admin")
	{
		// Public: somebody signing in has no token to present. There is no
		// registration endpoint — the owner creates every other account, and
		// the owner itself is created by `cmd/admin`.
		admin.POST("/auth/login", adminHandler.Login)

		authed := admin.Group("", middleware.AdminAuth(tokens, adminService))
		{
			authed.GET("/auth/me", adminHandler.Me)
			authed.POST("/auth/logout", adminHandler.Logout)

			// The administrator's own account: their name and their picture,
			// and nothing else. The role and the status are not editable here
			// by anyone, including themselves.
			authed.PATCH("/profile", adminHandler.UpdateProfile)
			authed.POST("/profile/avatar", adminHandler.UploadAvatar)

			// Listings, behind the section the owner can withdraw.
			marketplaceListings := authed.Group("/listings",
				middleware.RequireSection(adminService, "listings"))
			{
				marketplaceListings.GET("", adminHandler.Listings)
				marketplaceListings.GET("/:id", adminHandler.ListingDetail)
				marketplaceListings.GET("/:id/images", adminHandler.ListingImages)
				// Moderation: approve what is waiting, close what is live,
				// restore what was removed.
				marketplaceListings.PATCH("/:id/status", adminHandler.SetListingStatus)
				// Somebody else's conversations are the most sensitive thing
				// this dashboard can show, so this one is the owner's alone —
				// checked in the service, not just hidden in the sidebar.
				marketplaceListings.GET("/:id/chats", adminHandler.ListingChats)
				// The full audit: every thread about this owner's listings,
				// with the text of withdrawn messages. Owner-only, and the
				// service refuses before it reads anything.
				marketplaceListings.GET("/:id/audit", adminHandler.ListingAudit)
			}

			// Conversations, behind the section the owner can withdraw. Who
			// spoke to whom is visible to any administrator with it; what they
			// said is the owner's alone.
			marketplaceChats := authed.Group("/chats",
				middleware.RequireSection(adminService, "chats"))
			{
				marketplaceChats.GET("", adminHandler.Chats)
				marketplaceChats.GET("/:id/messages", adminHandler.ChatMessages)
			}

			// Marketplace accounts. Moderating them is what an administrator
			// is for, so this is not owner-only — but it is behind the
			// "users" section, which the owner can withdraw.
			marketplaceUsers := authed.Group("/users", middleware.RequireSection(adminService, "users"))
			{
				marketplaceUsers.GET("", adminHandler.Users)
				marketplaceUsers.GET("/:id", adminHandler.UserDetail)
				marketplaceUsers.PATCH("/:id/status", adminHandler.SetUserStatus)
			}

			// The dashboard's own figures. Behind the "dashboard" section, so
			// an administrator without it cannot read the numbers by calling
			// the endpoint directly.
			stats := authed.Group("/dashboard", middleware.RequireSection(adminService, "dashboard"))
			{
				stats.GET("/stats", adminHandler.DashboardStats)
				stats.GET("/growth", adminHandler.DashboardGrowth)
				stats.GET("/districts", adminHandler.DashboardDistricts)
			}

			// Read by every administrator, because the dashboard draws its own
			// navigation from it. Written by the owner alone.
			// What each role may reach. Readable by any administrator: it
			// describes the rules, and knowing them grants nothing.
			authed.GET("/permissions", adminHandler.Permissions)

			// The roles this system has and what each one may reach, for the
			// form that creates an administrator. Readable by any
			// administrator for the same reason as /permissions: it describes
			// the rules, and knowing them grants nothing.
			authed.GET("/roles", adminHandler.Roles)

			// What administrators have done. Behind its own section, which the
			// owner can withdraw like any other.
			authed.GET("/audit-logs",
				middleware.RequireSection(adminService, "auditLogs"), adminHandler.AuditLogs)

			// How the marketplace behaves. The owner's alone, read and write:
			// these values decide whether listings reach the public at all.
			authed.GET("/settings", middleware.RequireOwner(), adminHandler.Settings)
			authed.PUT("/settings", middleware.RequireOwner(), adminHandler.UpdateSettings)
			// Back to the declared defaults, in one action.
			authed.DELETE("/settings", middleware.RequireOwner(), adminHandler.ResetSettings)

			authed.GET("/sidebar", adminHandler.Sidebar)
			authed.PUT("/sidebar", middleware.RequireOwner(), adminHandler.UpdateSidebar)

			// Managing administrators is the owner's, enforced here rather than
			// by hiding the link: a super admin calling this directly gets 403.
			admins := authed.Group("/admins", middleware.RequireOwner())
			{
				admins.GET("", adminHandler.List)
				admins.POST("", adminHandler.Create)
				admins.PATCH("/:id/status", adminHandler.SetStatus)
				admins.DELETE("/:id", adminHandler.Delete)
			}
		}
	}

	// Chat. The hub is process-wide state — the set of live sockets — so it is
	// built once here and shared by the service that publishes events and the
	// handler that accepts connections.
	hub := realtime.NewHub()
	chatService := service.NewChatService(
		chats, apartments, users, blocks, hub, files,
		// Chat attachments are served through an authorized endpoint, never as
		// static files: they are as private as the conversation they were sent
		// in. Listing photographs remain public, which is what a listing is.
		func(id uuid.UUID) string {
			return strings.TrimRight(cfg.PublicBaseURL, "/") + "/api/v1/attachments/" + id.String()
		},
		settingsService,
	)
	chatHandler := handler.NewChatHandler(chatService)

	// Blocking, on the /me group built above: the blocker is always the token's
	// user, so none of these routes names who is doing the blocking — only who
	// is being blocked.
	blockHandler := handler.NewBlockHandler(chatService)
	// Registered before "/:userId" so the literal path is not swallowed by the
	// parameter.
	me.GET("/blocks", blockHandler.List)
	me.GET("/blocks/:userId", blockHandler.State)
	me.POST("/blocks/:userId", blockHandler.Block)
	me.DELETE("/blocks/:userId", blockHandler.Unblock)

	conversations := v1.Group("/conversations", middleware.Auth(tokens))
	{
		conversations.POST("", chatHandler.StartConversation)
		conversations.GET("", chatHandler.ListConversations)
		// Registered before "/:id" so the literal path is not swallowed by the
		// parameter.
		conversations.GET("/unread", chatHandler.UnreadTotal)
		conversations.GET("/:id", chatHandler.GetConversation)
		conversations.GET("/:id/messages", chatHandler.ListMessages)
		conversations.POST("/:id/messages", chatHandler.SendMessage)
		conversations.POST("/:id/read", chatHandler.MarkRead)

		// One person's view of a thread: pinning and archiving write to the
		// caller's own participant row, so neither can reach the other side.
		conversations.PATCH("/:id/pin", chatHandler.SetPinned)
		conversations.PATCH("/:id/archive", chatHandler.SetArchived)
		// Hides the thread for the caller, or withdraws it from both — the
		// body chooses, the token decides who is asking.
		conversations.DELETE("/:id", chatHandler.DeleteConversation)
	}

	messages := v1.Group("/messages", middleware.Auth(tokens))
	{
		messages.PATCH("/:id", chatHandler.EditMessage)
		messages.DELETE("/:id", chatHandler.DeleteMessage)
		// Registered before ":id" would ever be consulted for it — a POST to
		// /messages/delete is the bulk action, not a message with that id.
		messages.POST("/delete", chatHandler.DeleteMessages)
	}

	// What the client may send. Read from the server so the picker's filters
	// and the size check are not numbers restated in the frontend.
	v1.GET("/attachments/limits", chatHandler.AttachmentLimits)
	// QueryAuth, not Auth: a browser cannot set an Authorization header on an
	// <img> or an <audio> source, so the token may also arrive in the query.
	v1.GET("/attachments/:id", middleware.QueryAuth(tokens), chatHandler.DownloadAttachment)

	// The realtime channel. Authenticated inside the handler rather than by
	// middleware: a browser cannot set an Authorization header on a WebSocket
	// handshake, so the token arrives as a query parameter.
	v1.GET("/ws", handler.NewWSHandler(hub, chatService, tokens, cfg.AllowedOrigins).Connect)

	// Listing photographs are served straight off disk: a published listing's
	// pictures are public by definition. Chat attachments are not here — they
	// go through the authorized endpoint above.
	router.Static(files.PublicPath(), files.Dir())
	v1.POST("/uploads/images",
		middleware.Auth(tokens), handler.NewUploadHandler(files, settingsService, cfg.PublicBaseURL).UploadImage)

	return router, nil
}
