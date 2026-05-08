package domain

type Settlement struct {
	ID       string
	OrderID  string
	Amount   int64
	Currency string
	State    SettlementState
}

type SettlementState uint8

const (
	SettlementStatePending SettlementState = iota
	SettlementStateClearing
	SettlementStateSettled
	SettlementStateFailed
)

type Order struct {
	ID       string
	Symbol   string
	Side     OrderSide
	Quantity int64
	Price    int64
}

type OrderSide uint8

const (
	OrderSideBuy OrderSide = iota
	OrderSideSell
)

type LedgerEntry struct {
	ID          string
	AccountID   string
	Amount      int64
	Currency    string
	Description string
}
