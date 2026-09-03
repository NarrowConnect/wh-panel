package websocket

import (
	"context"
	"encoding/json"
	"log"
	"sync"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"

	"wh-panel/internal/auth"
	"wh-panel/internal/models"
)

type Client struct {
	Conn      *websocket.Conn
	CompanyID string
	UserID    string
}

type Hub struct {
	clients    map[*Client]bool
	companies  map[string]map[*Client]bool // CompanyID -> map of Clients
	register   chan *Client
	unregister chan *Client
	broadcast  chan models.WSEvent
	mu         sync.RWMutex
}

func NewHub() *Hub {
	h := &Hub{
		clients:    make(map[*Client]bool),
		companies:  make(map[string]map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan models.WSEvent, 256),
	}
	go h.run()
	return h
}

func (h *Hub) run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			if h.companies[client.CompanyID] == nil {
				h.companies[client.CompanyID] = make(map[*Client]bool)
			}
			h.companies[client.CompanyID][client] = true
			h.mu.Unlock()
			log.Printf("[WebSocket] Client connected: user %s for company %s", client.UserID, client.CompanyID)

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				if h.companies[client.CompanyID] != nil {
					delete(h.companies[client.CompanyID], client)
					if len(h.companies[client.CompanyID]) == 0 {
						delete(h.companies, client.CompanyID)
					}
				}
				_ = client.Conn.Close()
				log.Printf("[WebSocket] Client disconnected: user %s for company %s", client.UserID, client.CompanyID)
			}
			h.mu.Unlock()

		case event := <-h.broadcast:
			payload, err := json.Marshal(event)
			if err != nil {
				log.Printf("[WebSocket] Failed to marshal event %s: %v", event.Event, err)
				continue
			}
			// Snapshot clients under RLock to avoid holding lock during I/O
			h.mu.RLock()
			companyClients := h.companies[event.CompanyID]
			clients := make([]*Client, 0, len(companyClients))
			for cl := range companyClients {
				clients = append(clients, cl)
			}
			h.mu.RUnlock()

			var failed []*Client
			for _, client := range clients {
				if err := client.Conn.WriteMessage(websocket.TextMessage, payload); err != nil {
					log.Printf("[WebSocket] Write error to client %s: %v", client.UserID, err)
					failed = append(failed, client)
				}
			}
			if len(failed) > 0 {
				h.mu.Lock()
				for _, client := range failed {
					if _, ok := h.clients[client]; ok {
						_ = client.Conn.Close()
						delete(h.clients, client)
						if h.companies[client.CompanyID] != nil {
							delete(h.companies[client.CompanyID], client)
							if len(h.companies[client.CompanyID]) == 0 {
								delete(h.companies, client.CompanyID)
							}
						}
					}
				}
				h.mu.Unlock()
			}
		}
	}
}

// BroadcastToCompany sends real-time event payload to all clients of a company
func (h *Hub) BroadcastToCompany(companyID string, eventName string, data interface{}) {
	h.broadcast <- models.WSEvent{
		Event:     eventName,
		CompanyID: companyID,
		Data:      data,
	}
}

// UpgradeHandler middleware upgrade HTTP to WebSocket protocol
func UpgradeHandler() fiber.Handler {
	return func(c *fiber.Ctx) error {
		if websocket.IsWebSocketUpgrade(c) {
			c.Locals("allowed", true)
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	}
}

// HandleWebSocketConnection manages WebSocket lifecycle
func (h *Hub) HandleWebSocketConnection(jwtMgr *auth.JWTManager) fiber.Handler {
	return websocket.New(func(c *websocket.Conn) {
		tokenStr := c.Query("token")
		if tokenStr == "" {
			_ = c.WriteJSON(fiber.Map{"error": "Missing token query param"})
			c.Close()
			return
		}

		claims, err := jwtMgr.ValidateToken(context.Background(), tokenStr)
		if err != nil {
			_ = c.WriteJSON(fiber.Map{"error": "Invalid token"})
			c.Close()
			return
		}

		client := &Client{
			Conn:      c,
			CompanyID: claims.CompanyID.String(),
			UserID:    claims.UserID.String(),
		}

		h.register <- client

		defer func() {
			h.unregister <- client
		}()

		// Keep connection alive & listen for incoming ping/pong or client messages
		for {
			_, _, err := c.ReadMessage()
			if err != nil {
				break
			}
		}
	})
}
