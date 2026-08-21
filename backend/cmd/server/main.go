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
	"github.com/samandar-hodiev/Rent-House/backend/internal/repository"
	"github.com/samandar-hodiev/Rent-House/backend/internal/service"
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

	v1 := router.Group("/api/v1")
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
		cfg.OTP,
	)
	authHandler := handler.NewAuthHandler(authService)

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
	}

	return router, nil
}
