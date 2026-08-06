import { describe, it, expect } from 'vitest';
import {
  parseServerPorts,
  getPrimaryExternalPort,
  getPrimaryPort,
} from '../src/handlers/utils/server/ports';
import { getPrimaryPort as sharedGetPrimaryPort } from '../src/modules/user/server/shared';

describe('portsCanonical: primary port is the EXTERNAL port', () => {
  // The daemon /minecraft/players handler pings the node address on the
  // externally mapped port (server start maps external:internal). The primary
  // port used for that query must therefore be the external half — NOT the
  // internal half that legacy `split(':')[1]` incorrectly yielded.
  it('getPrimaryExternalPort returns the external half of a legacy Port "ext:int"', () => {
    expect(getPrimaryExternalPort('[{"Port":"25566:25565","primary":true}]')).toBe(25566);
  });

  it('getPrimaryExternalPort returns external half, never the internal port', () => {
    const legacy = '[{"Port":"30000:25565","primary":true}]';
    const port = getPrimaryExternalPort(legacy);
    expect(port).toBe(30000);
    expect(port).not.toBe(25565);
  });

  it('parseServerPorts keeps external and internal distinct', () => {
    const [port] = parseServerPorts('[{"Port":"30000:25565","primary":true}]');
    expect(port?.externalPort).toBe(30000);
    expect(port?.internalPort).toBe(25565);
  });

  it('shared getPrimaryPort matches canonical getPrimaryExternalPort', () => {
    const raw = '[{"Port":"25566:25565","primary":true}]';
    expect(sharedGetPrimaryPort(raw)).toBe(getPrimaryExternalPort(raw));
  });

  it('returns undefined when no valid primary port exists', () => {
    expect(getPrimaryExternalPort(null)).toBeUndefined();
    expect(getPrimaryExternalPort('[]')).toBeUndefined();
  });
});