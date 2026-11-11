/** Types shared by the layers of the environment backend; contracts for other plugins belong in -common. */
export interface EnvironmentStatusDto {
  plugin: 'environment';
  status: 'ok';
}
