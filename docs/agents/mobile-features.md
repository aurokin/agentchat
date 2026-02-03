# Mobile Features And UI Patterns

## OpenRouter Streaming

React Native uses XHR streaming for OpenRouter (fetch buffers). See `packages/shared/src/core/openrouter/index.ts`.

## Rendering Attachments In Chat Views

### Thumbnail Rendering With Metadata (Recommended)

```typescript
import { Image } from "react-native";
import { getAttachment } from "../../../src/lib/db";

const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const renderAttachmentThumbnail = (attachment: Attachment) => {
    const aspectRatio =
        attachment.width && attachment.height
            ? attachment.width / attachment.height
            : 1;
    const thumbnailSize = 80;
    const thumbnailWidth = thumbnailSize;
    const thumbnailHeight = thumbnailSize / aspectRatio;

    return (
        <View key={attachment.id} style={styles.attachmentThumbnailContainer}>
            <Image
                source={{ uri: attachment.data }}
                style={[
                    styles.attachmentThumbnail,
                    { width: thumbnailWidth, height: thumbnailHeight },
                ]}
                resizeMode="cover"
            />
            <View style={styles.attachmentMetadata}>
                <Text style={styles.attachmentDimension}>
                    {attachment.width} × {attachment.height}
                </Text>
                <Text style={styles.attachmentSize}>
                    {formatFileSize(attachment.size)}
                </Text>
            </View>
        </View>
    );
};

const renderAttachments = (attachmentIds: string[]) => {
    if (!attachmentIds || attachmentIds.length === 0) return null;

    const attachments = attachmentIds
        .map((id) => getAttachment(id))
        .filter((a): a is Attachment => a !== undefined);

    if (attachments.length === 0) return null;

    return (
        <View style={styles.attachmentsContainer}>
            {attachments.map(renderAttachmentThumbnail)}
        </View>
    );
};
```

### Required Styles For Thumbnails

```typescript
attachmentsContainer: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
},
attachmentThumbnailContainer: {
    alignItems: "flex-start",
    gap: 4,
},
attachmentThumbnail: {
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.05)",
},
attachmentMetadata: {
    paddingHorizontal: 4,
    paddingVertical: 2,
},
attachmentDimension: {
    fontSize: 10,
    color: "#666",
},
attachmentSize: {
    fontSize: 10,
    color: "#999",
},
```

### Full-Size Image Rendering (Legacy)

```typescript
import { Image, Dimensions } from "react-native";
import { getAttachment } from "../../../src/lib/db";

const screenWidth = Dimensions.get("window").width;

const renderFullSizeAttachments = (attachmentIds: string[]) => {
    if (!attachmentIds || attachmentIds.length === 0) return null;

    return (
        <View style={styles.attachmentsContainer}>
            {attachmentIds.map((attachmentId) => {
                const attachment = getAttachment(attachmentId);
                if (!attachment) return null;

                const aspectRatio = attachment.width && attachment.height
                    ? attachment.width / attachment.height
                    : 1;
                const maxWidth = screenWidth - 80;
                const maxHeight = 300;
                let imageWidth = maxWidth;
                let imageHeight = maxWidth / aspectRatio;

                if (imageHeight > maxHeight) {
                    imageHeight = maxHeight;
                    imageWidth = maxHeight * aspectRatio;
                }

                return (
                    <Image
                        key={attachment.id}
                        source={{ uri: attachment.data }}
                        style={[
                            styles.attachmentImage,
                            { width: imageWidth, height: imageHeight },
                        ]}
                        resizeMode="contain"
                    />
                );
            })}
        </View>
    );
};
```

### Key Points

- Use synchronous `getAttachment` from `lib/db` operations (not the async version in storage).
- For thumbnails: use 80px base size with `resizeMode="cover"` for consistent grid display.
- For full-size: calculate aspect ratio with max height of 300px.
- Use `resizeMode="contain"` to prevent image distortion for full-size images.
- Metadata (dimensions and size) helps users confirm attachments at a glance.
- Attachments render below message content and above thinking sections.

## Attachment Gallery Viewer

The mobile app includes a full-screen image gallery viewer that opens when tapping attachment thumbnails.

### Gallery Component

```typescript
import { AttachmentGallery } from "../../../src/components/chat/AttachmentGallery";
import type { Attachment } from "@shared/core/types";

const [galleryVisible, setGalleryVisible] = useState(false);
const [galleryAttachments, setGalleryAttachments] = useState<Attachment[]>([]);
const [galleryInitialIndex, setGalleryInitialIndex] = useState(0);

const getChatAttachments = (): Attachment[] => {
    const allAttachments: Attachment[] = [];
    const seenIds = new Set<string>();

    chatMessages.forEach((message) => {
        if (message.attachmentIds) {
            message.attachmentIds.forEach((id) => {
                if (!seenIds.has(id)) {
                    seenIds.add(id);
                    const attachment = getAttachment(id);
                    if (attachment) {
                        allAttachments.push(attachment);
                    }
                }
            });
        }
    });

    return allAttachments;
};

const openGallery = (attachmentId: string, attachments: Attachment[]) => {
    const index = attachments.findIndex((a) => a.id === attachmentId);
    if (index >= 0) {
        setGalleryAttachments(attachments);
        setGalleryInitialIndex(index);
        setGalleryVisible(true);
    }
};

<AttachmentGallery
    visible={galleryVisible}
    attachments={galleryAttachments}
    initialIndex={galleryInitialIndex}
    onClose={() => setGalleryVisible(false)}
/>;
```

### Making Thumbnails Tappable

```typescript
const renderAttachmentThumbnail = (attachment: Attachment) => {
    const aspectRatio = attachment.width && attachment.height
        ? attachment.width / attachment.height
        : 1;
    const thumbnailSize = 80;
    const thumbnailWidth = thumbnailSize;
    const thumbnailHeight = thumbnailSize / aspectRatio;

    return (
        <TouchableOpacity
            key={attachment.id}
            style={styles.attachmentThumbnailContainer}
            onPress={() => openGallery(attachment.id, getChatAttachments())}
            activeOpacity={0.7}
        >
            <Image
                source={{ uri: attachment.data }}
                style={[
                    styles.attachmentThumbnail,
                    { width: thumbnailWidth, height: thumbnailHeight },
                ]}
                resizeMode="cover"
            />
        </TouchableOpacity>
    );
};
```

### Gallery Props

```typescript
interface AttachmentGalleryProps {
    visible: boolean;
    attachments: Attachment[];
    initialIndex: number;
    onClose: () => void;
}
```

### Gallery Features

- Full-screen display with black background
- Swipe navigation between attachments
- Metadata display (dimensions and file size)
- Position indicator ("1 of N") and dot indicators
- Close button in top-right
- Swipe down to dismiss

## Attachment Picker (Camera And Library)

The mobile app uses `expo-image-picker` for capturing photos and selecting images from the library.

### Required Package

```json
"expo-image-picker": "~16.0.3"
```

### Attachment Picker Component

Use `src/components/chat/AttachmentPicker.tsx` for image selection:

```typescript
import { AttachmentPicker } from "../../../src/components/chat/AttachmentPicker";
import type { Attachment } from "@shared/core/types";

const [attachments, setAttachments] = useState<Attachment[]>([]);

const handleAttachmentsSelected = (newAttachments: Attachment[]) => {
    setAttachments((prev) => [...prev, ...newAttachments]);
};

const handleRemoveAttachment = (attachmentId: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
};

<AttachmentPicker
    onAttachmentsSelected={handleAttachmentsSelected}
    maxAttachments={5}
    disabled={isLoading}
/>;
```

### Image Picker Permissions

- Camera: `ImagePicker.requestCameraPermissionsAsync()`
- Library: `ImagePicker.requestMediaLibraryPermissionsAsync()`

### Supported Formats

- Media types: `ImagePicker.MediaTypeOptions.Images`
- Multiple selection: up to `maxAttachments` (default: 5)
- Quality: 0.8 (80% quality)

### Attachment Data Flow

1. User selects images via camera or library.
2. `createAttachmentFromAsset()` creates attachment objects with metadata.
3. Attachments stored in component state (not yet saved to database).
4. On send, attachments are:
   - Saved to SQLite with temporary messageId
   - Message created with attachmentIds
   - Attachments updated with actual messageId

### Sending Messages With Attachments

```typescript
const handleSend = async () => {
    const attachmentIds: string[] = [];
    for (const attachment of attachments) {
        const savedAttachment = { ...attachment, messageId: "" };
        const id = saveAttachment(savedAttachment);
        attachmentIds.push(id);
    }

    const message = await addMessage({
        sessionId: chatId,
        role: "user",
        content: inputText,
        contextContent: inputText,
        attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
    });

    for (const id of attachmentIds) {
        const attachment = getAttachment(id);
        if (attachment) {
            saveAttachment({ ...attachment, messageId: message.id });
        }
    }
};
```

## Clipboard Image Paste

The mobile app supports pasting images from the clipboard using React Native's `Clipboard` API.

```typescript
import { Clipboard } from "react-native";
```

### Clipboard Paste Pattern

- `AttachmentPicker` includes a "Paste from Clipboard" option.
- `Clipboard.getString()` retrieves clipboard content.
- Valid image URIs start with `file://`, `http://`, or `data:image`.
- `createAttachmentFromUri()` creates an attachment from the URI.

### Supported Clipboard Formats

- `file://` URIs (local image files)
- `http://` URIs (remote image URLs)
- `data:image` URIs (base64-encoded image data)

### Fallback Behavior

- Empty clipboard: "No Image" alert
- Non-image content: "Not an Image" alert
- Errors: generic error alert suggesting file picker

## Image Resizing And Compression

The mobile app uses `expo-image-manipulator` to resize and compress images before storage.

### Required Package

```json
"expo-image-manipulator": "~13.0.6"
```

### Image Processing Module

Use `lib/storage/image-processing.ts` for image processing:

```typescript
import { processImage, getMimeTypeFromUri } from "@/lib/storage";

const result = await processImage(uri, "image/jpeg");
```

### Result Fields

- `result.uri`: processed image file URI
- `result.width`: new width after resizing
- `result.height`: new height after resizing
- `result.size`: file size in bytes (compressed)
- `result.base64Data`: base64-encoded data for storage

### Processing Configuration

- Max dimension: 1920px (larger images are scaled down maintaining aspect ratio)
- Compression quality: 0.8 (80%)
- Output format: JPEG for most images, PNG for transparency

### Attachment Picker Integration

```typescript
import { processImage, getMimeTypeFromUri } from "../../lib/storage";

async function createAttachmentFromAsset(
    asset: ImagePicker.ImagePickerAsset,
): Promise<Attachment> {
    const uri = asset.uri;
    const mimeType = asset.mimeType ?? getMimeTypeFromUri(uri);

    const processed = await processImage(uri, mimeType);

    return {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        messageId: "",
        type: "image",
        mimeType: processed.uri.endsWith(".png") ? "image/png" : "image/jpeg",
        data: `data:image/jpeg;base64,${processed.base64Data}`,
        width: processed.width,
        height: processed.height,
        size: processed.size,
        createdAt: Date.now(),
    };
}
```

### Benefits

- Smaller file sizes for faster uploads and less storage usage
- Consistent image dimensions for better memory management
- Reduced bandwidth for cloud sync operations
- Prevents very large images from causing performance issues

## Related Files

- `src/components/chat/AttachmentPicker.tsx`
- `src/components/chat/MessageInput.tsx`
- `src/components/chat/AttachmentGallery.tsx`
- `app/chat/[id]/index.tsx`
- `src/lib/db/operations.ts`
- `src/lib/storage/image-processing.ts`
- `src/lib/storage/index.ts`
- `@shared/core/types`
