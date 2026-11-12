apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: {{ .Values.clusterName }}
  labels:
    fasrun.dev/component: database
spec:
  instances: 1
  imageName: {{ .Values.imageName | quote }}
  enableSuperuserAccess: false
  bootstrap:
    initdb:
      database: fasrun
      owner: fasrun_owner
      secret:
        name: {{ .Values.existingSecrets.owner }}
  storage:
    size: {{ .Values.storage.size }}
  managed:
    roles:
      - name: fasrun_owner
        ensure: present
        login: true
        superuser: false
        createdb: false
        createrole: false
        inherit: false
        replication: false
        bypassrls: true
        passwordSecret:
          name: {{ .Values.existingSecrets.owner }}
      - name: fasrun_app
        ensure: present
        login: true
        superuser: false
        createdb: false
        createrole: false
        inherit: false
        replication: false
        bypassrls: false
        passwordSecret:
          name: {{ .Values.existingSecrets.app }}
