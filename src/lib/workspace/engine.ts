import type { FileMap, PendingChangeProposal } from "@/lib/agent/types";
import { MutationCoordinator } from "./mutations";
import { ProjectWorkspace } from "./workspace";

/**
 * One workspace, one mutation coordinator. Both the agent loop and the
 * editor share this instance — constructing a second ProjectWorkspace for
 * the same files was the dual-workspace bug.
 */
export class WorkbenchEngine {
  readonly workspace: ProjectWorkspace;
  readonly mutations: MutationCoordinator;

  constructor(files: FileMap) {
    this.workspace = new ProjectWorkspace(files);
    this.mutations = new MutationCoordinator(this.workspace);
  }
}

let engine = new WorkbenchEngine({});

export function getEngine(): WorkbenchEngine {
  return engine;
}

export function resetEngine(files: FileMap, pending: PendingChangeProposal[] = []): WorkbenchEngine {
  engine = new WorkbenchEngine(files);
  engine.mutations.hydrate(pending);
  return engine;
}
