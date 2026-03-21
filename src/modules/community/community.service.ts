import { Knex } from 'knex';

// ── Community is system-triggered shared infrastructure (LOCKED) ──────────────
// No self-initiated community features at launch.
// Triggered by: Bookings (group creation), Blog (thread creation).
// Seekers may read threads, reply to threads, and use DMs / group messaging.

export type CommunityTriggerType = 'BLOG_POST' | 'BOOKING_GROUP';

export interface CommunityThread {
  id: string;
  trigger_type: CommunityTriggerType;
  trigger_id: string;
  created_by: string;
  title: string;
  reply_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface CommunityThreadReply {
  id: string;
  thread_id: string;
  author_id: string;
  content: string;
  created_at: Date;
  updated_at: Date;
}

export interface CommunityThreadWithReplies extends CommunityThread {
  replies: CommunityThreadReply[];
}

export interface CommunityDM {
  id: string;
  participant_a_id: string;
  participant_b_id: string;
  last_message_at: Date | null;
  created_at: Date;
}

export interface CommunityDMMessage {
  id: string;
  dm_id: string;
  sender_id: string;
  content: string;
  created_at: Date;
}

export interface CommunityGroup {
  id: string;
  trigger_type: 'BOOKING_GROUP';
  trigger_id: string;
  name: string;
  member_count: number;
  created_at: Date;
}

export interface CommunityGroupMessage {
  id: string;
  group_id: string;
  sender_id: string;
  content: string;
  created_at: Date;
}

export interface CreateThreadParams {
  triggerType: CommunityTriggerType;
  triggerId: string;
  createdBy: string;
  title: string;
}

export interface AddThreadReplyParams {
  threadId: string;
  authorId: string;
  content: string;
}

export interface SendDMMessageParams {
  dmId: string;
  senderId: string;
  content: string;
}

export interface SendGroupMessageParams {
  groupId: string;
  senderId: string;
  content: string;
}

export interface CreateGroupParams {
  triggerType: 'BOOKING_GROUP';
  triggerId: string;
  name: string;
  memberIds: string[];
}

export class CommunityService {
  constructor(private readonly db: Knex) {}

  // ── Thread infrastructure (F3 contract — required before Blog publish) ───────

  // System-triggered: called by BlogService.publishPost() [G5 bridge]
  // Idempotent: returns existing thread if one exists for the same trigger.
  async createThread(params: CreateThreadParams): Promise<CommunityThread> {
    const existing = await this.db('community_threads')
      .where({ trigger_type: params.triggerType, trigger_id: params.triggerId })
      .first();
    if (existing) return existing as CommunityThread;

    const [thread] = await this.db('community_threads')
      .insert({
        trigger_type: params.triggerType,
        trigger_id: params.triggerId,
        created_by: params.createdBy,
        title: params.title,
        reply_count: 0,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');
    return thread as CommunityThread;
  }

  // GET thread + all replies — seeker-facing
  async getThread(threadId: string): Promise<CommunityThreadWithReplies | null> {
    const thread = await this.db('community_threads').where({ id: threadId }).first();
    if (!thread) return null;

    const replies = await this.db('community_thread_replies')
      .where({ thread_id: threadId })
      .orderBy('created_at', 'asc');

    return { ...(thread as CommunityThread), replies: replies as CommunityThreadReply[] };
  }

  // Add a reply to a thread — seeker-authored, requires thread to exist
  async addThreadReply(params: AddThreadReplyParams): Promise<CommunityThreadReply> {
    const thread = await this.db('community_threads').where({ id: params.threadId }).first();
    if (!thread) throw new Error('NOT_FOUND: Thread not found');

    if (!params.content || params.content.trim().length === 0) {
      throw new Error('INVALID_CONTENT: Reply content cannot be empty');
    }

    return this.db.transaction(async (trx) => {
      const [reply] = await trx('community_thread_replies')
        .insert({
          thread_id: params.threadId,
          author_id: params.authorId,
          content: params.content.trim(),
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning('*');

      await trx('community_threads')
        .where({ id: params.threadId })
        .increment('reply_count', 1)
        .update({ updated_at: new Date() });

      return reply as CommunityThreadReply;
    });
  }

  // ── Direct Messages ──────────────────────────────────────────────────────────

  // List all DM conversations a user is part of, most recent first
  async listUserDMs(userId: string): Promise<CommunityDM[]> {
    const rows = await this.db('community_dms')
      .where({ participant_a_id: userId })
      .orWhere({ participant_b_id: userId })
      .orderBy('last_message_at', 'desc');
    return rows as CommunityDM[];
  }

  // Find or create a DM conversation between two users
  async getOrCreateDM(userId: string, recipientId: string): Promise<CommunityDM> {
    if (userId === recipientId) {
      throw new Error('INVALID_RECIPIENT: Cannot create DM with yourself');
    }

    // Canonical ordering ensures uniqueness regardless of who initiates
    const [participantA, participantB] = [userId, recipientId].sort();

    const existing = await this.db('community_dms')
      .where({ participant_a_id: participantA, participant_b_id: participantB })
      .first();
    if (existing) return existing as CommunityDM;

    const [dm] = await this.db('community_dms')
      .insert({
        participant_a_id: participantA,
        participant_b_id: participantB,
        last_message_at: null,
        created_at: new Date(),
      })
      .returning('*');
    return dm as CommunityDM;
  }

  // Paginated message history — caller must be a participant
  async getDMMessages(
    dmId: string,
    requestingUserId: string,
    opts: { limit: number; offset: number },
  ): Promise<CommunityDMMessage[]> {
    const dm = await this.db('community_dms').where({ id: dmId }).first();
    if (!dm) throw new Error('NOT_FOUND: DM conversation not found');

    if (dm.participant_a_id !== requestingUserId && dm.participant_b_id !== requestingUserId) {
      throw new Error('FORBIDDEN: Not a participant in this conversation');
    }

    const rows = await this.db('community_dm_messages')
      .where({ dm_id: dmId })
      .orderBy('created_at', 'asc')
      .limit(opts.limit)
      .offset(opts.offset);
    return rows as CommunityDMMessage[];
  }

  // Send a message in a DM — sender must be a participant
  async sendDMMessage(params: SendDMMessageParams): Promise<CommunityDMMessage> {
    const dm = await this.db('community_dms').where({ id: params.dmId }).first();
    if (!dm) throw new Error('NOT_FOUND: DM conversation not found');

    if (dm.participant_a_id !== params.senderId && dm.participant_b_id !== params.senderId) {
      throw new Error('FORBIDDEN: Not a participant in this conversation');
    }

    if (!params.content || params.content.trim().length === 0) {
      throw new Error('INVALID_CONTENT: Message content cannot be empty');
    }

    return this.db.transaction(async (trx) => {
      const [message] = await trx('community_dm_messages')
        .insert({
          dm_id: params.dmId,
          sender_id: params.senderId,
          content: params.content.trim(),
          created_at: new Date(),
        })
        .returning('*');

      await trx('community_dms')
        .where({ id: params.dmId })
        .update({ last_message_at: new Date() });

      return message as CommunityDMMessage;
    });
  }

  // ── Groups ───────────────────────────────────────────────────────────────────

  // System-triggered: called by BookingsService when a group booking is confirmed.
  // Idempotent: returns existing group if one exists for the same trigger.
  async createGroup(params: CreateGroupParams): Promise<CommunityGroup> {
    const existing = await this.db('community_groups')
      .where({ trigger_type: params.triggerType, trigger_id: params.triggerId })
      .first();
    if (existing) return existing as CommunityGroup;

    return this.db.transaction(async (trx) => {
      const [group] = await trx('community_groups')
        .insert({
          trigger_type: params.triggerType,
          trigger_id: params.triggerId,
          name: params.name,
          member_count: params.memberIds.length,
          created_at: new Date(),
        })
        .returning('*');

      if (params.memberIds.length > 0) {
        await trx('community_group_members').insert(
          params.memberIds.map((uid) => ({
            group_id: group.id,
            user_id: uid,
            joined_at: new Date(),
          })),
        );
      }

      return group as CommunityGroup;
    });
  }

  // Get group details — gated: requesting user must be a member
  async getGroupForMember(groupId: string, requestingUserId: string): Promise<CommunityGroup | null> {
    const membership = await this.db('community_group_members')
      .where({ group_id: groupId, user_id: requestingUserId })
      .first();

    if (!membership) return null;

    const group = await this.db('community_groups').where({ id: groupId }).first();
    return group ? (group as CommunityGroup) : null;
  }

  // Send a message to a group — sender must be a member
  async sendGroupMessage(params: SendGroupMessageParams): Promise<CommunityGroupMessage> {
    const membership = await this.db('community_group_members')
      .where({ group_id: params.groupId, user_id: params.senderId })
      .first();

    if (!membership) throw new Error('FORBIDDEN: Not a member of this group');

    const group = await this.db('community_groups').where({ id: params.groupId }).first();
    if (!group) throw new Error('NOT_FOUND: Group not found');

    if (!params.content || params.content.trim().length === 0) {
      throw new Error('INVALID_CONTENT: Message content cannot be empty');
    }

    const [message] = await this.db('community_group_messages')
      .insert({
        group_id: params.groupId,
        sender_id: params.senderId,
        content: params.content.trim(),
        created_at: new Date(),
      })
      .returning('*');

    return message as CommunityGroupMessage;
  }
}
