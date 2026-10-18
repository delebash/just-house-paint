# The AI features

Each AI feature is a row under **AI Settings → Routing by feature**, with its own engine preset —
the model and settings it runs on. One model can serve every feature, or a feature can point at a
stronger one.

## Suggest color schemes

**Suggest schemes** on a house's **Schemes** tab ([Color schemes](color-schemes.md)). The app tells
the AI the house's current colors — read from your photo, part by part — which parts will be
painted and what you'd like, and asks for schemes as JSON; it matches every color to the brand's
nearest real paint. It runs on the **General** preset.

The AI photo isn't an AI feature in this sense: it runs its own image model on your computer — see
[The AI photo](ai-photo.md).

## Changing what a feature says or runs on

Select the feature under **Routing by feature**. Its prompt — what the model is told — is shown and
can be edited and saved in the Lab, and its preset can be pointed at another model or provider.
**Reset** puts the original back.
