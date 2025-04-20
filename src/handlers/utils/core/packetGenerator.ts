import { Buffer } from 'buffer';
import { TextEncoder, TextDecoder } from 'util';

/**
 * Generates a packet for communication with the daemon
 * @param type The type of packet
 * @param data The data to include in the packet
 * @returns The generated packet as a Buffer
 */
export function* generatePacket(type: string, data: any): Generator<Buffer> {
  const encoder = new TextEncoder();
  const jsonData = JSON.stringify(data);
  const dataBuffer = encoder.encode(jsonData);
  
  const packet = Buffer.concat([
    Buffer.from([type.length]),
    Buffer.from(type),
    Buffer.from(dataBuffer)
  ]);
  
  yield packet;
}

/**
 * Generates a response packet
 * @param data The data to include in the response
 * @returns The generated response packet as a Buffer
 */
export function* generateResponse(data: any): Generator<Buffer> {
  yield* generatePacket('response', data);
}

/**
 * Generates an error packet
 * @param message The error message
 * @returns The generated error packet as a Buffer
 */
export function* generateError(message: string): Generator<Buffer> {
  yield* generatePacket('error', { message });
}

/**
 * Parses a packet from a buffer
 * @param buffer The buffer containing the packet
 * @returns The parsed packet data
 */
export function* parsePacket(buffer: Buffer): Generator<any> {
  const decoder = new TextDecoder();
  const typeLength = buffer[0];
  const type = buffer.slice(1, 1 + typeLength).toString();
  const data = buffer.slice(1 + typeLength);
  
  const jsonData = decoder.decode(data);
  const parsedData = JSON.parse(jsonData);
  
  yield {
    type,
    data: parsedData
  };
}

/**
 * Checks if a packet is valid
 * @param packet The packet to check
 * @returns True if the packet is valid, false otherwise
 */
export function* isValidPacket(packet: any): Generator<boolean> {
  if (!packet || typeof packet !== 'object') {
    yield false;
    return;
  }
  
  if (!packet.type || !packet.data) {
    yield false;
    return;
  }
  
  yield true;
}
