apiVersion: batch/v1
kind: Job
metadata:
  name: fasrun-migrate
  labels:
    fasrun.dev/component: migration
  annotations:
    helm.sh/hook: pre-install,pre-upgrade
    helm.sh/hook-weight: "-10"
    helm.sh/hook-delete-policy: before-hook-creation
spec:
  backoffLimit: 0
  activeDeadlineSeconds: {{ .Values.migration.activeDeadlineSeconds }}
  template:
    metadata:
      labels:
        fasrun.dev/component: migration
    spec:
      restartPolicy: Never
      automountServiceAccountToken: false
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
        runAsGroup: 65532
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: migrate
          image: {{ .Values.images.cli | quote }}
          imagePullPolicy: {{ .Values.imagePullPolicy }}
          args: ["bin/run.js", "migrate", "--json"]
          env:
            - name: FASRUN_MIGRATE_DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: {{ .Values.database.ownerSecret }}
                  key: uri
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: [ALL]
