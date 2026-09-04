import { InMemoryResearchRepository } from "@/lib/research/repository";
import { ResearchService } from "@/lib/research/service";

const repo = new InMemoryResearchRepository();
export const researchService = new ResearchService(repo);
