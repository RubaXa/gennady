// @file: StackPlugin implementation for Swift Package, Xcode, and Tuist repositories.
// @spec: CLI-VERIFY
// @consumers: stack-registry

import type { StackDetection, StackPlugin } from 'gennady/stack';
import {
  detectSwiftProject,
  isSwiftBuildDefinitionPath,
  type SwiftProject,
} from './swift-detect.logic.ts';
import { SWIFT_GATE_ORDER, planSwiftGates } from './swift-plan.logic.ts';
import { resolveSwiftScope, type SwiftScope } from './swift-scope.logic.ts';
import { createSwiftVerifyPreset, evaluateSwiftReadiness } from './swift-target.logic.ts';

function summary(project: SwiftProject): string[] {
  return [
    `kind:       ${project.kind}`,
    `markers:    ${project.markers.join(', ')}`,
    `manifests:  ${project.manifests.length}`,
  ];
}

/** @purpose Register Swift legacy verification and target preset/readiness behind one plugin id. */
export const swiftPlugin: StackPlugin = {
  id: 'swift',
  marker: 'Package.swift|Project.swift|*.xcodeproj|*.xcworkspace',
  description:
    'Swift Package/Xcode/Tuist: format, build, test, lint; Xcode argv stays config-owned',
  detect(root): StackDetection | null {
    const project = detectSwiftProject(root);
    return project
      ? {
          stack: 'swift',
          root,
          summary: summary(project),
          diagnostics: project.diagnostics,
          details: project,
        }
      : null;
  },
  gateIds: SWIFT_GATE_ORDER,
  verify: {
    resolveScope(detection, request) {
      return resolveSwiftScope(detection.details as SwiftProject, request);
    },
    planGates(detection, scope, options) {
      return planSwiftGates(detection.details as SwiftProject, scope as SwiftScope, options);
    },
  },
  target: {
    affectsScope(_detection, scope) {
      return (
        scope.mode === 'all' ||
        scope.files.length === 0 ||
        scope.files.some((file) => file.endsWith('.swift') || isSwiftBuildDefinitionPath(file))
      );
    },
    createPreset: createSwiftVerifyPreset,
    evaluateReadiness: evaluateSwiftReadiness,
  },
};
