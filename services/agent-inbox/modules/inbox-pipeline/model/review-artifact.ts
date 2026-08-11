// @file: Immutable addressable analysis artifact revisions.
// @consumers: ReviewStructuralValidator, ReviewSynthesis, dashboard
// @tasks: TSK-176

/** @purpose One addressable fragment produced for a contract slot. */
export type ReviewArtifactFragment = Readonly<{
  fragmentId: string;
  slotId: string;
  anchor: string;
  content: string;
  fields: Readonly<Record<string, unknown>>;
}>;

/** @purpose Durable immutable revision of agent-authored review analysis. */
export type ReviewArtifact = Readonly<{
  artifactId: string;
  revision: number;
  manifestRef: string;
  contractId: string;
  contractVersion: string;
  producerSessionId: string;
  producerModel: string;
  fragments: readonly ReviewArtifactFragment[];
  createdAt: string;
}>;
