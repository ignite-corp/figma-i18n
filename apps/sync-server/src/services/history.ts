import { prisma } from "../lib/prisma";

export async function getHistory(params: {
  figmaFileId?: string;
  keyName?: string;
  page: number;
  limit: number;
}) {
  const where: Record<string, unknown> = {};
  if (params.figmaFileId) where.figmaFileId = params.figmaFileId;
  if (params.keyName) where.keyName = { contains: params.keyName };

  const [items, total] = await Promise.all([
    prisma.syncHistory.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
    prisma.syncHistory.count({ where }),
  ]);

  return {
    items: items.map((i) => ({
      id: i.id,
      figmaFileId: i.figmaFileId,
      nodeId: i.nodeId,
      keyName: i.keyName,
      action: i.action,
      prevValue: i.prevValue,
      newValue: i.newValue,
      triggeredBy: i.triggeredBy,
      createdAt: i.createdAt.toISOString(),
    })),
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
    },
  };
}
