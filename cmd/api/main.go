package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/joho/godotenv"

	"wh-panel/internal/auth"
	"wh-panel/internal/billing"
	"wh-panel/internal/campaigns"
	"wh-panel/internal/channels"
	"wh-panel/internal/contacts"
	"wh-panel/internal/conversations"
	"wh-panel/internal/crm"
	"wh-panel/internal/dashboard"
	"wh-panel/internal/docs"
	"wh-panel/internal/flows"
	"wh-panel/internal/integrations"
	"wh-panel/internal/queues"
	"wh-panel/internal/reports"
	"wh-panel/internal/templates"
	"wh-panel/internal/tenant"
	"wh-panel/internal/websocket"
	"wh-panel/pkg/meta"
	"wh-panel/pkg/postgres"
	"wh-panel/pkg/redis"
	"wh-panel/pkg/waha"
)

func main() {
	// Load .env if available
	if err := godotenv.Load(); err != nil {
		log.Println("[Config] No .env file found or error loading, falling back to environment variables")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// 1. Connect to PostgreSQL
	dbHost := getEnv("DB_HOST", "localhost")
	dbPort := getEnv("DB_PORT", "5432")
	dbUser := getEnv("DB_USER", "wh_user")
	dbPass := getEnv("DB_PASSWORD", "wh_password")
	dbName := getEnv("DB_NAME", "wh_panel_db")
	dbSSL := getEnv("DB_SSLMODE", "disable")

	db, err := postgres.Connect(postgres.Config{
		Host:     dbHost,
		Port:     dbPort,
		User:     dbUser,
		Password: dbPass,
		DBName:   dbName,
		SSLMode:  dbSSL,
	})
	if err != nil {
		log.Printf("[Warning] Database connection deferred/failed: %v", err)
	} else {
		// Run baseline migrations
		migrationFiles := []string{
			"migrations/000001_init_schema.up.sql",
			"migrations/000002_channels_and_contacts.up.sql",
			"migrations/000003_conversations_messages_tags.up.sql",
			"migrations/000004_queues_and_rules.up.sql",
			"migrations/000005_dashboard_metrics.up.sql",
			"migrations/000006_templates.up.sql",
			"migrations/000007_crm_kanban.up.sql",
			"migrations/000008_flows.up.sql",
			"migrations/000009_integrations_webhooks.up.sql",
			"migrations/000010_campaigns.up.sql",
			"migrations/000011_billing_and_ai.up.sql",
		}
		for _, file := range migrationFiles {
			if _, err := os.Stat(file); err == nil {
				if err := postgres.RunMigrations(db, file); err != nil {
					log.Printf("[Warning] Error executing migration %s: %v", file, err)
				}
			}
		}
	}

	// 2. Connect to Redis
	redisHost := getEnv("REDIS_HOST", "localhost")
	redisPort := getEnv("REDIS_PORT", "6379")
	redisPass := getEnv("REDIS_PASSWORD", "")

	redisClient, err := redis.Connect(redis.Config{
		Host:     redisHost,
		Port:     redisPort,
		Password: redisPass,
	})
	if err != nil {
		log.Printf("[Warning] Redis connection deferred/failed: %v", err)
	}

	// 3. Initialize Auth & JWT Manager
	jwtSecret := getEnv("JWT_SECRET", "super-secret-jwt-key-change-in-production-32bytes")
	accessExpHours, _ := strconv.Atoi(getEnv("JWT_ACCESS_EXPIRATION_HOURS", "24"))
	refreshExpDays, _ := strconv.Atoi(getEnv("JWT_REFRESH_EXPIRATION_DAYS", "7"))

	jwtMgr := auth.NewJWTManager(jwtSecret, accessExpHours, refreshExpDays, redisClient)

	// 4. Initialize Real-Time WebSocket Hub & Event Publisher & Workers
	wsHub := websocket.NewHub()
	eventPublisher := integrations.NewEventPublisher(db)
	campaignsDispatcher := campaigns.NewDispatcher(db, redisClient)
	campaignsDispatcher.StartStreamWorker(context.Background())

	// 5. Initialize Fiber App
	app := fiber.New(fiber.Config{
		AppName:      "WH - Panel Omnichannel SaaS API",
		ServerHeader: "WH-Panel-Go",
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{
				"error": err.Error(),
			})
		},
	})

	// Middlewares
	app.Use(recover.New())
	app.Use(logger.New(logger.Config{
		Format: "[${time}] ${status} - ${latency} ${method} ${path}\n",
	}))
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
		AllowMethods: "GET, POST, HEAD, PUT, DELETE, PATCH, OPTIONS",
	}))

	// Healthcheck Route for EasyPanel & Load Balancers
	app.Get("/health", func(c *fiber.Ctx) error {
		status := "ok"
		dbStatus := "connected"
		redisStatus := "connected"

		if db == nil || db.Ping() != nil {
			dbStatus = "disconnected"
		}
		if redisClient == nil {
			redisStatus = "disconnected"
		}

		return c.JSON(fiber.Map{
			"status":   status,
			"postgres": dbStatus,
			"redis":    redisStatus,
			"time":     time.Now().Format(time.RFC3339),
		})
	})

	// WebSocket Routes for Real-Time Conversations
	app.Use("/ws", websocket.UpgradeHandler())
	app.Get("/ws/conversations", wsHub.HandleWebSocketConnection(jwtMgr))

	// Documentation Routes (Swagger UI at /docs and OpenAPI spec at /swagger.json)
	docsHandler := docs.NewHandler()
	docsHandler.RegisterPublicRoutes(app)

	// API Route Group v1
	api := app.Group("/api/v1")

	// Initialize Meta Graph API & Narrow App client
	metaAppID := getEnv("META_APP_ID", "")
	metaAppSecret := getEnv("META_APP_SECRET", "")
	metaVerifyToken := getEnv("META_VERIFY_TOKEN", "narrow_wh_verify_secret_2026")
	metaAPIVersion := getEnv("META_API_VERSION", "v20.0")
	metaAccessToken := getEnv("META_ACCESS_TOKEN", "")
	metaConfigID := getEnv("META_CONFIG_ID", "894644480139460")

	metaClient := meta.NewClient(meta.Config{
		AppID:       metaAppID,
		AppSecret:   metaAppSecret,
		VerifyToken: metaVerifyToken,
		APIVersion:  metaAPIVersion,
		AccessToken: metaAccessToken,
		ConfigID:    metaConfigID,
	})

	// Initialize WAHA (WhatsApp HTTP API) client
	wahaBaseURL := getEnv("WAHA_BASE_URL", "http://localhost:3000")
	wahaAPIKey := getEnv("WAHA_API_KEY", "")

	wahaClient := waha.NewClient(waha.Config{
		BaseURL: wahaBaseURL,
		APIKey:  wahaAPIKey,
	})

	// Initialize Handlers & Services
	authHandler := auth.NewHandler(db, jwtMgr)
	tenantHandler := tenant.NewHandler(db, jwtMgr)
	channelsHandler := channels.NewHandler(db, jwtSecret, metaClient, wahaClient)
	contactsHandler := contacts.NewHandler(db)
	conversationsHandler := conversations.NewHandler(db, redisClient, wsHub)
	queuesService := queues.NewService(db, redisClient, wsHub)
	queuesHandler := queues.NewHandler(db, queuesService)
	dashboardHandler := dashboard.NewHandler(db)
	templatesHandler := templates.NewHandler(db)
	crmHandler := crm.NewHandler(db)
	flowsEngine := flows.NewEngine(db, wsHub)
	flowsHandler := flows.NewHandler(db, flowsEngine)
	integrationsHandler := integrations.NewHandler(db, jwtSecret, eventPublisher)
	campaignsHandler := campaigns.NewHandler(db, campaignsDispatcher)
	reportsHandler := reports.NewHandler(db)
	billingHandler := billing.NewHandler(db, jwtSecret)

	// Public Routes
	authHandler.RegisterRoutes(api)
	tenantHandler.RegisterPublicRoutes(api)
	channelsHandler.RegisterPublicRoutes(app) // Webhook receiver endpoints

	// Protected Routes (Require Authentication & Tenant Context)
	protected := api.Group("/", tenant.AuthAndTenantMiddleware(jwtMgr, db))

	// Protected Handlers
	protected.Get("/auth/me", authHandler.GetMe)
	tenantHandler.RegisterProtectedRoutes(protected)
	channelsHandler.RegisterProtectedRoutes(protected)
	contactsHandler.RegisterProtectedRoutes(protected)
	conversationsHandler.RegisterProtectedRoutes(protected)
	queuesHandler.RegisterProtectedRoutes(protected)
	dashboardHandler.RegisterProtectedRoutes(protected)
	templatesHandler.RegisterProtectedRoutes(protected)
	crmHandler.RegisterProtectedRoutes(protected)
	flowsHandler.RegisterProtectedRoutes(protected)
	integrationsHandler.RegisterProtectedRoutes(protected)
	campaignsHandler.RegisterProtectedRoutes(protected)
	reportsHandler.RegisterProtectedRoutes(protected)
	billingHandler.RegisterProtectedRoutes(protected)

	// Static Web SPA Serving (React Frontend)
	if _, err := os.Stat("web/dist"); err == nil {
		app.Static("/", "./web/dist")
		app.Get("/*", func(c *fiber.Ctx) error {
			path := c.Path()
			if (len(path) >= 4 && path[:4] == "/api") ||
				(len(path) >= 3 && path[:3] == "/ws") ||
				(len(path) >= 5 && path[:5] == "/docs") ||
				(len(path) >= 7 && path[:7] == "/health") ||
				(len(path) >= 13 && path[:13] == "/swagger.json") ||
				(len(path) >= 9 && path[:9] == "/webhooks") {
				return c.Next()
			}
			return c.SendFile("./web/dist/index.html")
		})
	}

	// Start Server asynchronously
	go func() {
		log.Printf("[Server] WH-Panel API running on port %s", port)
		log.Printf("[Server] Swagger UI documentation available at http://localhost:%s/docs", port)
		if err := app.Listen(":" + port); err != nil {
			log.Fatalf("[Server] Error listening on port %s: %v", port, err)
		}
	}()

	// Graceful Shutdown Signal Interceptor
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	<-c

	log.Println("[Server] Shutting down gracefully...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := app.ShutdownWithContext(ctx); err != nil {
		log.Printf("[Server] Error during Fiber shutdown: %v", err)
	}

	if db != nil {
		db.Close()
	}

	log.Println("[Server] Application stopped successfully")
}

func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists && value != "" {
		return value
	}
	return fallback
}
