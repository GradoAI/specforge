{{- range $component, $port := dict "core" 7010 "connect" 7011 "portal" 7013 }}
{{- $name := printf "fasrun-%s-svc" $component }}
{{- if eq $component "portal" }}{{ $name = "fasrun-portal-web" }}{{ end }}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ $name }}
  labels:
    fasrun.dev/component: {{ $component }}
spec:
  replicas: 1
  selector:
    matchLabels:
      fasrun.dev/component: {{ $component }}
  template:
    metadata:
      labels:
        fasrun.dev/component: {{ $component }}
    spec:
      automountServiceAccountToken: false
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
        runAsGroup: 65532
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: {{ $component }}
          image: {{ index $.Values.images $component | quote }}
          imagePullPolicy: {{ $.Values.imagePullPolicy }}
          ports:
            - name: http
              containerPort: {{ $port }}
          {{- if eq $component "core" }}
          env:
            - name: FASRUN_CORE_DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: {{ $.Values.database.appSecret }}
                  key: uri
          {{- else if eq $component "connect" }}
          env:
            - name: FASRUN_CONNECT_CORE_URL
              value: http://fasrun-core-svc:7010
          {{- end }}
          livenessProbe:
            httpGet:
              path: /healthz
              port: http
            initialDelaySeconds: 5
          readinessProbe:
            httpGet:
              path: /readyz
              port: http
            initialDelaySeconds: 2
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: [ALL]
---
apiVersion: v1
kind: Service
metadata:
  name: {{ $name }}
  labels:
    fasrun.dev/component: {{ $component }}
spec:
  type: ClusterIP
  selector:
    fasrun.dev/component: {{ $component }}
  ports:
    - name: http
      port: {{ $port }}
      targetPort: http
{{- end }}
