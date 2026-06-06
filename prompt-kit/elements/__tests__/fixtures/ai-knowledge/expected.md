KEYWORDS:
knowledge

<!--START_GROUP-->
# ## AiKnowledge:

<!--START_GROUP-->
## ## Directives:

<!--START_GROUP-->
### ## Sdd:

<!--START_GROUP-->
#### ## SddSetup:

##### - **File:**:

ai/directives/sdd/setup.directive.xml

##### - **Purpose:**:

Creates or updates specs/README.md — Vision and Scope Graph. Sole owner of the Portal. Idempotent.

##### - **Triggers:**:

new project · add scope · change project vision · register scope after discovery

##### - **SkipWhen:**:

designing a specific scope · module decomposition · task scaffolding

##### - **Preconditions:**:

None
<!--END_GROUP-->

<!--START_GROUP-->
#### ## SddDiscovery:

##### - **File:**:

ai/directives/sdd/discovery.directive.xml

##### - **Purpose:**:

Scope-level discovery session. Creates or evolves specs/[scope]/[scope].spec.md. Branches by scope-type: infrastructure, contracts, library, product.

##### - **Triggers:**:

design scope · raw idea for service/SDK/CLI/app · bootstrap infra tooling · refine or pivot existing scope

##### - **SkipWhen:**:

approved spec exists and operator wants module decomposition · bug fix or local refactor · project-level vision change

##### - **Preconditions:**:

greenfield: none. refine/pivot: specs/[scope]/[scope].spec.md exists
<!--END_GROUP-->

<!--START_GROUP-->
#### ## SddModuleDecomposition:

##### - **File:**:

ai/directives/sdd/module-decomposition.directive.xml

##### - **Purpose:**:

Decomposes a product or library scope into module specs with closed-world entity inventory, public surfaces, DbC contracts (Ports / Adapters / Services).

##### - **Triggers:**:

discovery complete · split into modules · build module map · list all entities · produce DbC · Ports and Adapters

##### - **SkipWhen:**:

scope spec missing or not approved · discovery still open · scope-type is infrastructure or contracts · tasks already generated

##### - **Preconditions:**:

specs/[scope]/[scope].spec.md with scope-type=product or library
<!--END_GROUP-->
<!--END_GROUP-->
<!--END_GROUP-->

<!--START_GROUP-->
## ## Rules:

### - **CheckPhaseOrder:**:

typecheck test lint format
<!--END_GROUP-->
<!--END_GROUP-->