// Package response defines the JSON envelope every handler returns, so clients
// see one shape across the whole API.
package response

import "github.com/gin-gonic/gin"

// Body is the response envelope. Empty fields are omitted, so a plain
// acknowledgement stays as small as {"success":true,"message":"..."}.
//
// A failure carries both: `message` for a human, `error` for a machine. The
// client branches on the stable code, not on wording that may be translated or
// reworded later.
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

// Error writes the given status with a client-safe message and a stable code.
//
// Neither must carry internal detail — driver errors, SQL text, file paths and
// secrets belong in the log, not in the response.
func Error(c *gin.Context, status int, code, message string) {
	c.JSON(status, Body{Success: false, Message: message, Error: code})
}

// AbortWithError writes the error and stops the handler chain. Middleware uses
// this so a rejected request never reaches the handler behind it.
func AbortWithError(c *gin.Context, status int, code, message string) {
	c.AbortWithStatusJSON(status, Body{Success: false, Message: message, Error: code})
}
