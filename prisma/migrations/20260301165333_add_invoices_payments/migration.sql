-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" TEXT NOT NULL,
    "rHash" TEXT NOT NULL,
    "paymentRequest" TEXT NOT NULL,
    "amountSat" BIGINT NOT NULL,
    "memo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "settledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invoice_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" TEXT NOT NULL,
    "paymentRequest" TEXT NOT NULL,
    "amountSat" BIGINT NOT NULL,
    "feeSat" BIGINT NOT NULL DEFAULT 0,
    "preimage" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_rHash_key" ON "Invoice"("rHash");

-- CreateIndex
CREATE INDEX "Invoice_nodeId_idx" ON "Invoice"("nodeId");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Payment_nodeId_idx" ON "Payment"("nodeId");
