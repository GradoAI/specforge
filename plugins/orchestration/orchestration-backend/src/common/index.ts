/** Types shared by the layers of the orchestration backend; contracts for other plugins belong in -common. */
export interface OrchestrationStatusDto {
  plugin: 'orchestration';
  status: 'ok';
}
