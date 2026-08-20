// Package response defines the JSON envelope every handler returns, so clients
// see one shape across the whole API.
package response

import "github.com/gin-gonic/gin"

// Body is the response envelope. Data and Error are omitted when unset, so a
// plain acknowledgement stays as small as {"success":true,"message":"..."}.
type Body struct {
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
	Data    any    `json:"data,omitempty"`
	Error   string `json:"error,omitempty"`
}

// OK writes a 200 with an optional message and payload.
func OK(c *gin.Context, message string, data any) {
	c.JSON(200, Body{Success: true, Message: message, Data: data})
}

// Success writes the given status code with an optional message and payload.
func Success(c *gin.Context, status int, message string, data any) {
	c.JSON(status, Body{Success: true, Message: message, Data: data})
}

// Error writes the given status code with a client-safe message.
//
// The message must never carry internal detail — driver errors, SQL text or
// file paths belong in the log, not in the response.
func Error(c *gin.Context, status int, message string) {
	c.JSON(status, Body{Success: false, Error: message})
}
