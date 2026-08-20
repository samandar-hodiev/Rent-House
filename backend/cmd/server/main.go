// Command server is the RentHouse HTTP API entry point.
package main

import (
	"context"
	"errors"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/samandar-hodiev/Rent-House/backend/internal/config"
	"github.com/samandar-hodiev/Rent-House/backend/internal/database"
	"github.com/samandar-hodiev/Rent-House/backend/internal/middleware"
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

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           newRouter(cfg, db),
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

// newRouter wires the middleware and the routes. `db` is threaded through for
// the handlers that arrive in the feature phases; nothing reads it yet.
func newRouter(cfg *config.Config, _ *gorm.DB) *gin.Engine {
	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery(), middleware.CORS(cfg.AllowedOrigins))

	// Liveness probe: intentionally does not touch the database, so it answers
	// "the process is up" rather than "every dependency is up".
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// Every feature endpoint will hang off this group. It is empty by design.
	v1 := router.Group("/api/v1")
	v1.GET("", func(c *gin.Context) {
		response.OK(c, "RentHouse API v1", nil)
	})

	return router
}
