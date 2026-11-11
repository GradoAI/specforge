/** Types shared by the layers of the connect backend; contracts for other plugins belong in -common. */
export interface ConnectStatusDto {
  plugin: 'connect';
  status: 'ok';
}
