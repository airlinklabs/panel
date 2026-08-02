-- CreateTable
CREATE TABLE "Allocation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nodeId" INTEGER NOT NULL,
    "ip" TEXT NOT NULL DEFAULT '',
    "port" INTEGER NOT NULL,
    "serverId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Allocation_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Allocation_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server" ("UUID") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Allocation_nodeId_ip_port_key" ON "Allocation"("nodeId", "ip", "port");

-- CreateIndex
CREATE INDEX "Allocation_nodeId_serverId_idx" ON "Allocation"("nodeId", "serverId");