/** Types shared by the layers of the knowledge backend; contracts for other plugins belong in -common. */
export interface KnowledgeStatusDto {
  plugin: 'knowledge';
  status: 'ok';
}
