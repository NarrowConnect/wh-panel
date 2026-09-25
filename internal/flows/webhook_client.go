package flows

import (
	"errors"
	"net"
	"net/http"
	"os"
	"strings"
	"syscall"
	"time"
)

// errBlockedAddress is returned when a webhook step points at the server's
// own network (loopback, private ranges, cloud metadata...).
var errBlockedAddress = errors.New("endereço interno bloqueado para webhooks")

var cgnat = &net.IPNet{IP: net.IPv4(100, 64, 0, 0), Mask: net.CIDRMask(10, 32)}

func blockedIP(ip net.IP) bool {
	return ip == nil || ip.IsLoopback() || ip.IsPrivate() || ip.IsUnspecified() ||
		ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsMulticast() ||
		ip.IsInterfaceLocalMulticast() || cgnat.Contains(ip)
}

// webhookClient is the HTTP client used by webhook steps. Tenants choose the
// URL, so the dialer refuses internal addresses after DNS resolution (which
// also covers DNS rebinding). FLOWS_WEBHOOK_ALLOW_PRIVATE=true lifts the
// restriction for local development.
func webhookClient() *http.Client {
	allowPrivate := strings.EqualFold(os.Getenv("FLOWS_WEBHOOK_ALLOW_PRIVATE"), "true")
	dialer := &net.Dialer{
		Timeout: 5 * time.Second,
		Control: func(_, address string, _ syscall.RawConn) error {
			if allowPrivate {
				return nil
			}
			host, _, err := net.SplitHostPort(address)
			if err != nil {
				return err
			}
			if blockedIP(net.ParseIP(host)) {
				return errBlockedAddress
			}
			return nil
		},
	}
	return &http.Client{
		Timeout: 10 * time.Second,
		Transport: &http.Transport{
			DialContext:           dialer.DialContext,
			TLSHandshakeTimeout:   5 * time.Second,
			ResponseHeaderTimeout: 8 * time.Second,
			MaxIdleConns:          20,
			IdleConnTimeout:       30 * time.Second,
		},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return errors.New("redirecionamentos demais")
			}
			return nil
		},
	}
}
