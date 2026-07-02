package main

import rego.v1

deny contains msg if {
	input.kind == "Deployment"
	some container in input.spec.template.spec.containers
	not container.securityContext.readOnlyRootFilesystem
	msg := sprintf("%s container must use readOnlyRootFilesystem", [input.metadata.name])
}

deny contains msg if {
	input.kind == "Deployment"
	some container in input.spec.template.spec.containers
	not drops_all_capabilities(container)
	msg := sprintf("%s container must drop all capabilities", [input.metadata.name])
}

drops_all_capabilities(container) if {
	"ALL" in container.securityContext.capabilities.drop
}

deny contains msg if {
	input.kind == "Deployment"
	input.spec.template.spec.automountServiceAccountToken != false
	msg := sprintf("%s must disable service account token automount", [input.metadata.name])
}

deny contains msg if {
	input.kind == "Ingress"
	some rule in input.spec.rules
	some path in rule.http.paths
	startswith(path.path, "/internal")
	msg := sprintf("%s must not expose /internal paths", [input.metadata.name])
}

deny contains msg if {
	input.kind == "Ingress"
	some rule in input.spec.rules
	some path in rule.http.paths
	endswith(path.backend.service.name, "-internal")
	msg := sprintf("%s must not route to the internal Service", [input.metadata.name])
}
