/** Types shared by the layers of the entry backend; contracts for other plugins belong in -common. */
export interface EntryStatusDto {
  plugin: 'entry';
  status: 'ok';
}
