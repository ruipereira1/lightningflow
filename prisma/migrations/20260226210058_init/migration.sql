-- CreateTable
CREATE TABLE "Node" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "macaroon" TEXT,
    "cert" TEXT,
    "rune" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" TEXT NOT NULL,
    "remotePubkey" TEXT NOT NULL,
    "remoteAlias" TEXT,
    "capacity" BIGINT NOT NULL,
    "localBalance" BIGINT NOT NULL,
    "remoteBalance" BIGINT NOT NULL,
    "active" BOOLEAN NOT NULL,
    "localFeeRate" INTEGER NOT NULL,
    "baseFee" INTEGER NOT NULL,
    "remoteFeeRate" INTEGER,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Channel_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FeeHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "oldFeeRate" INTEGER NOT NULL,
    "newFeeRate" INTEGER NOT NULL,
    "oldBaseFee" INTEGER NOT NULL,
    "newBaseFee" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeeHistory_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeeHistory_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ForwardingEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "chanIdIn" TEXT NOT NULL,
    "chanIdOut" TEXT NOT NULL,
    "amtIn" BIGINT NOT NULL,
    "amtOut" BIGINT NOT NULL,
    "fee" BIGINT NOT NULL,
    CONSTRAINT "ForwardingEvent_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RebalanceJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" TEXT NOT NULL,
    "fromChannel" TEXT NOT NULL,
    "toChannel" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "feePaid" BIGINT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "RebalanceJob_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AutoRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "targetRatio" REAL,
    "maxFeePpm" INTEGER,
    "minFeePpm" INTEGER,
    "maxFeePpmSet" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutoRule_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AppConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "passwordHash" TEXT NOT NULL,
    "sessionSecret" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Channel_nodeId_idx" ON "Channel"("nodeId");

-- CreateIndex
CREATE INDEX "Channel_remotePubkey_idx" ON "Channel"("remotePubkey");

-- CreateIndex
CREATE INDEX "FeeHistory_nodeId_idx" ON "FeeHistory"("nodeId");

-- CreateIndex
CREATE INDEX "FeeHistory_channelId_idx" ON "FeeHistory"("channelId");

-- CreateIndex
CREATE INDEX "ForwardingEvent_nodeId_idx" ON "ForwardingEvent"("nodeId");

-- CreateIndex
CREATE INDEX "ForwardingEvent_timestamp_idx" ON "ForwardingEvent"("timestamp");

-- CreateIndex
CREATE INDEX "ForwardingEvent_chanIdIn_idx" ON "ForwardingEvent"("chanIdIn");

-- CreateIndex
CREATE INDEX "ForwardingEvent_chanIdOut_idx" ON "ForwardingEvent"("chanIdOut");

-- CreateIndex
CREATE INDEX "RebalanceJob_nodeId_idx" ON "RebalanceJob"("nodeId");

-- CreateIndex
CREATE INDEX "RebalanceJob_status_idx" ON "RebalanceJob"("status");

-- CreateIndex
CREATE INDEX "AutoRule_nodeId_idx" ON "AutoRule"("nodeId");
