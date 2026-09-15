import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { CreateNotificationDto } from './dto/create-notification.dto';

export interface Notification extends CreateNotificationDto {
  id: string;
  createdAt: string;
  read: boolean;
}

@Injectable()
export class NotificationsService {
  private notifications: Notification[] = [];

  create(dto: CreateNotificationDto): Notification {
    const newNotification: Notification = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      read: false,
      ...dto,
    };
    this.notifications.push(newNotification);
    return newNotification;
  }

  findByRecipient(recipientId: string): Notification[] {
    return this.notifications
      .filter((n) => n.recipientId === recipientId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  markAsRead(id: string, callerId: string): Notification {
    const notification = this.notifications.find((n) => n.id === id);
    if (!notification) throw new NotFoundException('Notification not found');
    if (notification.recipientId !== callerId) {
      throw new ForbiddenException('This notification does not belong to you');
    }
    notification.read = true;
    return notification;
  }

  markAllAsRead(callerId: string): void {
    for (const notification of this.notifications) {
      if (notification.recipientId === callerId) {
        notification.read = true;
      }
    }
  }
}
