/** Types shared by the layers of the governance backend; contracts for other plugins belong in -common. */
export interface GovernanceStatusDto {
  plugin: 'governance';
  status: 'ok';
}
