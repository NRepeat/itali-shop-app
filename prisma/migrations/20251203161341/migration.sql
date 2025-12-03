-- CreateTable
CREATE TABLE "MetaobjectDefinition" (
    "id" TEXT NOT NULL,
    "metaobjecDefinitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaobjectDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Metaobject" (
    "id" TEXT NOT NULL,
    "metaobjectId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Metaobject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetaobjectDefinition_metaobjecDefinitionId_key" ON "MetaobjectDefinition"("metaobjecDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaobjectDefinition_name_key" ON "MetaobjectDefinition"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Metaobject_metaobjectId_key" ON "Metaobject"("metaobjectId");

-- CreateIndex
CREATE UNIQUE INDEX "Metaobject_handle_key" ON "Metaobject"("handle");
