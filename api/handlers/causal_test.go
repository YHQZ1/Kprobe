package handlers

import (
	"context"
	"testing"

	pb "github.com/YHQZ1/kprobe/api/proto"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestQueryHandlersValidateRequestsBeforeDependencies(t *testing.T) {
	handler := NewCausalHandler(nil, nil, nil)

	tests := []struct {
		name string
		call func() error
	}{
		{
			name: "causal chain requires transaction id",
			call: func() error {
				_, err := handler.QueryCausalChain(context.Background(), &pb.QueryCausalChainRequest{})
				return err
			},
		},
		{
			name: "events require transaction id",
			call: func() error {
				_, err := handler.QueryEvents(context.Background(), &pb.QueryEventsRequest{})
				return err
			},
		},
		{
			name: "time range requires bounds",
			call: func() error {
				_, err := handler.QueryTimeRange(context.Background(), &pb.QueryTimeRangeRequest{})
				return err
			},
		},
		{
			name: "time range rejects reversed bounds",
			call: func() error {
				_, err := handler.QueryTimeRange(context.Background(), &pb.QueryTimeRangeRequest{FromNs: 20, ToNs: 10})
				return err
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if code := status.Code(tt.call()); code != codes.InvalidArgument {
				t.Fatalf("status code = %s, want %s", code, codes.InvalidArgument)
			}
		})
	}
}

func TestQueryHandlersReportUnavailableDependencies(t *testing.T) {
	handler := NewCausalHandler(nil, nil, nil)

	if _, err := handler.QueryCausalChain(context.Background(), &pb.QueryCausalChainRequest{TransactionId: "tx"}); status.Code(err) != codes.Unavailable {
		t.Fatalf("causal chain status = %s, want %s", status.Code(err), codes.Unavailable)
	}
	if _, err := handler.QueryEvents(context.Background(), &pb.QueryEventsRequest{TransactionId: "tx"}); status.Code(err) != codes.Unavailable {
		t.Fatalf("events status = %s, want %s", status.Code(err), codes.Unavailable)
	}
	if _, err := handler.QueryTimeRange(context.Background(), &pb.QueryTimeRangeRequest{FromNs: 10, ToNs: 20}); status.Code(err) != codes.Unavailable {
		t.Fatalf("time range status = %s, want %s", status.Code(err), codes.Unavailable)
	}
}
