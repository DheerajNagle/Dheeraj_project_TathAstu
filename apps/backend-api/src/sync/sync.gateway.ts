import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class SyncGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    console.log(`KDS Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`KDS Client disconnected: ${client.id}`);
  }

  broadcastKOT(kotPayload: any) {
    if (this.server) {
      this.server.emit('kot:new', kotPayload);
    }
  }

  broadcastOrderUpdate(orderPayload: any) {
    if (this.server) {
      this.server.emit('order:updated', orderPayload);
    }
  }
}
