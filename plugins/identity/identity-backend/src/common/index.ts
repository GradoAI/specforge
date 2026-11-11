/** Types shared by the layers of the identity backend; contracts for other plugins belong in -common. */
export interface IdentityStatusDto {
  plugin: 'identity';
  status: 'ok';
}
