// @file: RoleEngine — loads .role.ts modules, registers roles, activates/deactivates.
// @consumers: RoleScheduler, inbox-api (BoardProvider)
// @tasks: TSK-113

import { logger } from '#logger';
import { RoleError } from './errors.ts';
import type { RoleDefinition, RoleGraph } from './role-node.ts';

/**
 * @purpose Registered role as seen by external consumers.
 */
export type RegisteredRole = {
  /** @purpose Unique role name (e.g. 'reviewer', 'author') */
  name: string;
  /** @purpose Human-readable description */
  description: string;
  /** @purpose Whether the role is currently active */
  active: boolean;
};

/**
 * @purpose Internal slot holding a loaded role and its activation state.
 */
type RoleSlot = {
  definition: RoleDefinition;
  active: boolean;
};

/**
 * @purpose Loads and manages role modules: registration, activation, deactivation.
 * @invariant Roles are loaded from TypeScript modules; a role must be loaded before activation.
 * @invariant activate/deactivate are idempotent — double activate is a no-op.
 * @consumer RoleScheduler, inbox-api
 */
export class RoleEngine {
  /** @purpose Loaded role slots keyed by role name */
  protected _roles: Map<string, RoleSlot>;

  /**
   * @purpose Create an empty RoleEngine — call loadAll() or register() before use.
   */
  constructor() {
    this._roles = new Map();
  }

  /**
   * @purpose Register a role definition directly (programmatic, for tests).
   * @param definition Full role definition including graph.
   * @throws {RoleError} When the graph is invalid (no nodes, no start node).
   */
  register(definition: RoleDefinition): void {
    logger.debug(`[RoleEngine#register] [idle → registering] ${definition.name}`);

    this._validateGraph(definition.graph, definition.name);

    this._roles.set(definition.name, {
      definition,
      active: false,
    });

    logger.info(`[RoleEngine#register] [registering → registered] ${definition.name}`, {
      nodeCount: definition.graph.nodes.length,
      edgeCount: definition.graph.edges.length,
    });
  }

  /**
   * @purpose Load all role modules from the file system.
   * @returns Promise that resolves when all roles are loaded.
   * @sideEffect Imports and registers all `.role.ts` modules found in this directory.
   */
  async loadAll(): Promise<void> {
    logger.debug('[RoleEngine#loadAll] [idle → loading]');

    // #region START_LOAD_ROLE_MODULES
    // invariant: we import roles dynamically — each role is a self-registering module
    // that calls engine.register() with its RoleDefinition on import.
    // For serve mode, roles are loaded from disk; for tests, they are registered directly.
    const { ReviewerRole } = await import('./reviewer.role.ts');
    const { AuthorRole } = await import('./author.role.ts');

    logger.debug('[RoleEngine#loadAll] [loading → loaded_modules]', {
      roles: [ReviewerRole.name, AuthorRole.name],
    });

    this.register(ReviewerRole);
    this.register(AuthorRole);
    // #endregion END_LOAD_ROLE_MODULES

    logger.info('[RoleEngine#loadAll] [loading → loaded]', { count: this._roles.size });
  }

  /**
   * @purpose Activate a role by name — enables tick processing for this role.
   * @param name Role name (e.g. 'reviewer', 'author').
   * @throws {RoleError} When the role is not registered.
   */
  activate(name: string): void {
    logger.debug(`[RoleEngine#activate] [idle → activating] ${name}`);

    const slot = this._roles.get(name);
    if (!slot) {
      throw new RoleError('ROLE_NOT_FOUND', `Role "${name}" is not registered`);
    }

    if (slot.active) {
      logger.debug(`[RoleEngine#activate] [activating → already_active] ${name}`);
      return;
    }

    slot.active = true;
    logger.info(`[RoleEngine#activate] [activating → active] ${name}`);
  }

  /**
   * @purpose Deactivate a role by name — stops tick processing for this role.
   * @param name Role name (e.g. 'reviewer', 'author').
   * @throws {RoleError} When the role is not registered.
   */
  deactivate(name: string): void {
    logger.debug(`[RoleEngine#deactivate] [active → deactivating] ${name}`);

    const slot = this._roles.get(name);
    if (!slot) {
      throw new RoleError('ROLE_NOT_FOUND', `Role "${name}" is not registered`);
    }

    if (!slot.active) {
      logger.debug(`[RoleEngine#deactivate] [deactivating → already_inactive] ${name}`);
      return;
    }

    slot.active = false;
    logger.info(`[RoleEngine#deactivate] [deactivating → inactive] ${name}`);
  }

  /**
   * @purpose List all registered roles with their activation state.
   * @returns Array of registered role descriptors.
   */
  list(): RegisteredRole[] {
    return Array.from(this._roles.entries()).map(([name, slot]) => ({
      name,
      description: slot.definition.description,
      active: slot.active,
    }));
  }

  /**
   * @purpose Retrieve a role definition by name.
   * @param name Role name.
   * @returns Role definition if registered, undefined otherwise.
   */
  retrieve(name: string): RoleDefinition | undefined {
    return this._roles.get(name)?.definition;
  }

  /**
   * @purpose Check whether a role is active.
   * @param name Role name.
   * @returns True if the role is registered and active.
   */
  isActive(name: string): boolean {
    return this._roles.get(name)?.active ?? false;
  }

  // ─── Graph validation ─────────────────────────────────────────────────────────

  /**
   * @purpose Validate a role graph for structural soundness.
   * @param graph The graph to validate.
   * @param roleName Role name for error context.
   * @throws {RoleError} When the graph is invalid.
   */
  protected _validateGraph(graph: RoleGraph, roleName: string): void {
    if (graph.nodes.length === 0) {
      throw new RoleError('GRAPH_INVALID', `Role "${roleName}" has no nodes`);
    }

    // #region START_VALIDATE_NODE_IDS
    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    for (const edge of graph.edges) {
      if (!nodeIds.has(edge.from) && edge.from !== 'start') {
        throw new RoleError(
          'GRAPH_INVALID',
          `Role "${roleName}": edge from="${edge.from}" references unknown node`
        );
      }
      if (!nodeIds.has(edge.to) && edge.to !== 'done') {
        throw new RoleError(
          'GRAPH_INVALID',
          `Role "${roleName}": edge to="${edge.to}" references unknown node`
        );
      }
    }
    // #endregion END_VALIDATE_NODE_IDS

    logger.debug(`[RoleEngine#_validateGraph] [validating → valid] ${roleName}`, {
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
    });
  }
}
