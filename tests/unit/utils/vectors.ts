/**
 * Dash mainnet/devnet block headers and their X11 digests, taken from the
 * upstream rs-x11-hash test suite so both layers are checked against the same
 * expectations.
 */
export const vectors: Array<{ header: string, digest: string }> = [
  {
    header:
      '020000002cc0081be5039a54b686d24d5d8747ee9770d9973ec1ace02e5c0500000000008d7139724b11c52995db4370284c998b9114154b120ad3486f1a360a1d4253d310d40e55b8f70a1be8e32300',
    digest:
      'f29c0f286fd8071669286c6987eb941181134ff5f3978bf89f34070000000000'
  },
  {
    header:
      '040000002e3df23eec5cd6a86edd509539028e2c3a3dc05315eb28f2baa43218ca080000b3a56d65316ffdb006163240a4380e94a4c2d8c0f0b3b2c1ddc486fae15ed065ba968054ffff7f2002000000',
    digest:
      '000739d9da507b3acb949f21fe10ad424abbad5b4c46789285b05fe36df5c5b0'
  },
  {
    header:
      '040000002e3df23eec5cd6a86edd509539028e2c3a3dc05315eb28f2baa43218ca080000b3a56d65316ffdb006163240a4380e94a4c2d8c0f0b3b2c1ddc486fae15ed065ba968054ffff7f2003000000',
    digest:
      '90ec0543cd91297e7ad3d3141a404fb55f787b3058aca2b45ab0fc20d06409c6'
  },
  {
    header:
      '040000002e3df23eec5cd6a86edd509539028e2c3a3dc05315eb28f2baa43218ca080000b3a56d65316ffdb006163240a4380e94a4c2d8c0f0b3b2c1ddc486fae15ed065ba968054ffff7f2004000000',
    digest:
      'eee8ff78056e3b0cd35cd8e267fa871270a183a5d05c764d8c2047b7c3cca014'
  }
]

export function hexToBytes (hex: string): Uint8Array {
  return Uint8Array.from(
    (hex.match(/.{2}/g) ?? []).map((byte) => parseInt(byte, 16))
  )
}
