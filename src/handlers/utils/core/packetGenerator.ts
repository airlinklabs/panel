import { Buffer } from 'buffer';
import { TextEncoder, TextDecoder } from 'util';
import logger from '../../../handlers/logger';

/**
 * Interface for packet data
 */
export interface PacketData {
  type: string;
  data: any;
}

/**
 * Generates a packet for communication with the daemon
 * @param type The type of packet
 * @param data The data to include in the packet
 * @returns The generated packet as a Buffer
 */
export function generatePacket(type: string, data: any): Buffer {
  try {
    const encoder = new TextEncoder();
    const jsonData = JSON.stringify(data);
    const dataBuffer = encoder.encode(jsonData);

    return Buffer.concat([
      Buffer.from([type.length]),
      Buffer.from(type),
      Buffer.from(dataBuffer)
    ]);
  } catch (error) {
    logger.error('Error generating packet:', error);
    throw new Error(`Failed to generate packet: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generates a response packet
 * @param data The data to include in the response
 * @returns The generated response packet as a Buffer
 */
export function generateResponse(data: any): Buffer {
  return generatePacket('response', data);
}

/**
 * Generates an error packet
 * @param message The error message
 * @returns The generated error packet as a Buffer
 */
export function generateError(message: string): Buffer {
  return generatePacket('error', { message });
}

/**
 * Parses a packet from a buffer
 * @param buffer The buffer containing the packet
 * @returns The parsed packet data
 */
export function parsePacket(buffer: Buffer): PacketData {
  try {
    const decoder = new TextDecoder();
    const typeLength = buffer[0];

    if (typeLength <= 0 || typeLength > buffer.length - 1) {
      throw new Error('Invalid packet format: incorrect type length');
    }

    const type = buffer.slice(1, 1 + typeLength).toString();
    const data = buffer.slice(1 + typeLength);

    const jsonData = decoder.decode(data);
    const parsedData = JSON.parse(jsonData);

    return {
      type,
      data: parsedData
    };
  } catch (error) {
    logger.error('Error parsing packet:', error);
    throw new Error(`Failed to parse packet: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Checks if a packet is valid
 * @param packet The packet to check
 * @returns True if the packet is valid, false otherwise
 */
export function isValidPacket(packet: any): boolean {
  if (!packet || typeof packet !== 'object') {
    return false;
  }

  if (!packet.type || !packet.data) {
    return false;
  }

  return true;
}

/**
 * Sends a packet to the daemon
 * @param socket The WebSocket to send the packet through
 * @param type The type of packet
 * @param data The data to include in the packet
 */
export function sendPacket(socket: WebSocket, type: string, data: any): void {
  try {
    const packet = generatePacket(type, data);
    socket.send(packet);
  } catch (error) {
    logger.error('Error sending packet:', error);
    throw new Error(`Failed to send packet: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Handles an incoming packet
 * @param packet The packet to handle
 * @param handlers Object containing handler functions for different packet types
 * @returns The result of the handler function
 */
export function handlePacket(packet: PacketData, handlers: Record<string, (data: any) => any>): any {
  try {
    if (!isValidPacket(packet)) {
      throw new Error('Invalid packet format');
    }

    const handler = handlers[packet.type];
    if (!handler) {
      throw new Error(`No handler found for packet type: ${packet.type}`);
    }

    return handler(packet.data);
  } catch (error) {
    logger.error('Error handling packet:', error);
    throw new Error(`Failed to handle packet: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
