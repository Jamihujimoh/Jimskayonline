# Chat Attachments Storage Architecture

## Scope

Only files and folders selected through the chat attachment controls bypass Firebase Storage.

### Chat attachments
- Single files are inspected server-side and staged temporarily.
- Folders are packaged into a temporary ZIP, inspected, and staged temporarily.
- The selected attachment is shown immediately in the composer.
- Temporary download URLs expire automatically.
- These original chat attachments are not uploaded to Firebase Storage.

### Generated and persistent content
Firebase Storage remains enabled for the existing persistent workflows:
- rebuilt/updated files produced by the file workspace
- generated video clips
- generated PDFs
- other existing durable creator outputs that already use Firebase Storage

This is intentional: the no-Firebase change applies only to user-selected chat attachments, not the creation system.
