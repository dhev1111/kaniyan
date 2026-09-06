import { NextResponse } from "next/server";
import { researchService } from "../../service";
import {
  findProvider,
  modelRegistry,
  parseConfidence,
  parseModelCost,
  parseOptionalPositiveInt,
  parseSourcesPayload,
  recordAIModelDiscovery,
  validateModelAccess,
  validateModelCategory,
  validateName,
} from "@/lib/research/models";
import type {
  AIModel,
  AIModelAccess,
} from "@/lib/research/models";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const obj = (body ?? {}) as Record<string, unknown>;

  const name = validateName(obj.name, "model name");
  if (!name.ok) {
    return NextResponse.json({ error: name.error }, { status: 400 });
  }

  const providerId = validateName(obj.providerId, "provider id", 100);
  if (!providerId.ok) {
    return NextResponse.json({ error: providerId.error }, { status: 400 });
  }

  const category = validateModelCategory(obj.category);
  if (!category.ok) {
    return NextResponse.json({ error: category.error }, { status: 400 });
  }

  let access: AIModelAccess = "unknown";
  if (obj.access !== undefined && obj.access !== null && obj.access !== "") {
    const accessValidation = validateModelAccess(obj.access);
    if (!accessValidation.ok) {
      return NextResponse.json(
        { error: accessValidation.error },
        { status: 400 }
      );
    }
    access = accessValidation.value;
  }

  const sources = parseSourcesPayload(body);
  if (!sources.ok) {
    return NextResponse.json({ error: sources.error }, { status: 400 });
  }

  const rawDescription =
    typeof obj.description === "string" ? obj.description.trim() : "";
  const rawApiModelId =
    typeof obj.apiModelId === "string" ? obj.apiModelId.trim() : "";
  const rawReleasedAt =
    typeof obj.releasedAt === "string" ? obj.releasedAt.trim() : "";

  const now = new Date().toISOString();
  const model: AIModel = {
    id: `mo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.value,
    providerId: providerId.value,
    category: category.value,
    description: rawDescription ? rawDescription.slice(0, 2000) : undefined,
    contextWindow: parseOptionalPositiveInt(obj.contextWindow),
    maxOutputTokens: parseOptionalPositiveInt(obj.maxOutputTokens),
    modalities: Array.isArray(obj.modalities)
      ? (obj.modalities as unknown[])
          .filter((m): m is string => typeof m === "string")
          .map((m) => m.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 12)
      : [],
    apiModelId: rawApiModelId ? rawApiModelId.slice(0, 100) : undefined,
    access,
    tags: Array.isArray(obj.tags)
      ? (obj.tags as unknown[])
          .filter((t): t is string => typeof t === "string")
          .map((t) => t.trim().slice(0, 60))
          .filter(Boolean)
          .slice(0, 12)
      : [],
    releasedAt: rawReleasedAt ? rawReleasedAt.slice(0, 32) : undefined,
    cost: parseModelCost(obj.cost),
    sources: sources.value,
    confidence: parseConfidence(obj.confidence, 0.6),
    verified: obj.verified === true,
    firstSeenAt: now,
    updatedAt: now,
  };

  modelRegistry.addModel(model);

  const provider = findProvider(model.providerId);
  const providerWebsite =
    typeof obj.providerWebsite === "string" ? obj.providerWebsite.trim() : "";
  if (!provider?.verified && /^https?:\/\//.test(providerWebsite)) {
    const primary = model.sources[0];
    modelRegistry.registerProvider({
      id: model.providerId,
      name: model.providerId,
      website: providerWebsite,
      description: "Provider discovered from a recorded AI model source.",
      sources: [
        {
          kind: "user",
          url: providerWebsite,
          title: model.providerId,
        },
      ],
      firstSeenAt: now,
      verified: false,
    });
  }

  const result = recordAIModelDiscovery(researchService, model);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? "Failed to record model discovery" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { model, record: result.record },
    { status: 201 }
  );
}