/** Types shared by the layers of the insight backend; contracts for other plugins belong in -common. */
export interface InsightStatusDto {
  plugin: 'insight';
  status: 'ok';
}
