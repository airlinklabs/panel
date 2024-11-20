-- CreateTable
CREATE TABLE "Magic_links" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT,
    "username" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false
);

-- CreateIndex
CREATE UNIQUE INDEX "Magic_links_email_key" ON "Magic_links"("email");
