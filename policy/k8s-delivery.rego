package main

deny[msg] {
  input.kind == "Deployment"
  container := input.spec.template.spec.containers[_]
  not container.securityContext.readOnlyRootFilesystem
  msg := sprintf("%s container must use readOnlyRootFilesystem", [input.metadata.name])
}

deny[msg] {
  input.kind == "Deployment"
  container := input.spec.template.spec.containers[_]
  not drops_all_capabilities(container)
  msg := sprintf("%s container must drop all capabilities", [input.metadata.name])
}

drops_all_capabilities(container) {
  container.securityContext.capabilities.drop[_] == "ALL"
}

deny[msg] {
  input.kind == "Deployment"
  input.spec.template.spec.automountServiceAccountToken != false
  msg := sprintf("%s must disable service account token automount", [input.metadata.name])
}

deny[msg] {
  input.kind == "Ingress"
  path := input.spec.rules[_].http.paths[_]
  startswith(path.path, "/internal")
  msg := sprintf("%s must not expose /internal paths", [input.metadata.name])
}

deny[msg] {
  input.kind == "Ingress"
  path := input.spec.rules[_].http.paths[_]
  endswith(path.backend.service.name, "-internal")
  msg := sprintf("%s must not route to the internal Service", [input.metadata.name])
}
