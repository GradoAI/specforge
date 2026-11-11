/** Types shared by the layers of the spec backend; contracts for other plugins belong in -common. */
export interface SpecStatusDto {
  plugin: 'spec';
  status: 'ok';
}
