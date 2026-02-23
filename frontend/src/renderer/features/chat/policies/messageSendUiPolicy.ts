export type ChatSendSurface = 'main-window' | 'overlay-chatbox';
export type ReturnToChatboxPolicy = 'never' | 'auto' | 'always';

type ResolveMessageSendUiBehaviorArgs = {
  senderSurface: ChatSendSurface;
  includeQueryScreenshot: boolean;
  returnToChatboxPolicy?: ReturnToChatboxPolicy;
};

type MessageSendUiBehavior = {
  senderSurface: ChatSendSurface;
  returnToChatboxPolicy: ReturnToChatboxPolicy;
  shouldReturnToChatboxOnSend: boolean;
};

function defaultReturnToChatboxPolicyForSurface(
  senderSurface: ChatSendSurface,
): ReturnToChatboxPolicy {
  if (senderSurface === 'main-window') {
    return 'auto';
  }
  return 'never';
}

function resolveReturnToChatboxOnSend(
  returnToChatboxPolicy: ReturnToChatboxPolicy,
  includeQueryScreenshot: boolean,
): boolean {
  if (returnToChatboxPolicy === 'always') {
    return true;
  }
  if (returnToChatboxPolicy === 'never') {
    return false;
  }
  return includeQueryScreenshot;
}

export function resolveMessageSendUiBehavior(
  args: ResolveMessageSendUiBehaviorArgs,
): MessageSendUiBehavior {
  const policy = args.returnToChatboxPolicy
    ?? defaultReturnToChatboxPolicyForSurface(args.senderSurface);

  return {
    senderSurface: args.senderSurface,
    returnToChatboxPolicy: policy,
    shouldReturnToChatboxOnSend: resolveReturnToChatboxOnSend(
      policy,
      args.includeQueryScreenshot,
    ),
  };
}
