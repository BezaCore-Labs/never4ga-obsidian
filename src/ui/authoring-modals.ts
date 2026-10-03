/**
 * Authoring: the two writes the companion makes, both through the service
 * and never to the vault directly.
 *
 * The design constraint is the same one the CLI verbs carry: **the service
 * decides, the surface asks.** Neither modal hardcodes product knowledge --
 * the create modal renders the Type Registry the service publishes over
 * `GET /v1/schema/types`, and a refusal arrives as the service's own message
 * and is shown verbatim, because parsing it would put product knowledge in
 * the plugin, and this repository never defines product behaviour. Type names
 * reach this file the same way a refusal's candidates do -- as data the
 * service sent, never as a list maintained here.
 *
 * When adoption cannot infer a type, the candidates arrive as *data* on the
 * error rather than only inside the sentence, and the modal offers them as a
 * dropdown. The service's message names no command-line flag, because not
 * every surface has one, so the modal builds its own ask from the data.
 */

import { type App, Modal, Notice, Setting } from "obsidian";

import { ApiError, type Never4gaClient, UnreachableError } from "../core/client.js";
import { booleanChoice, conceptFields, type FieldValue } from "../core/concept-fields.js";
import type { ConceptWritten, RegistryType, TypeRegistry } from "../core/types.js";

function failureNotice(error: unknown): void {
  if (error instanceof UnreachableError) {
    new Notice("Never4gA is not answering. The vault is fully usable; start the service to author through it.");
    return;
  }
  new Notice(error instanceof Error ? error.message : String(error), 10_000);
}

/**
 * Create a concept in the folder the person is looking at.
 *
 * With the registry in hand the type is a dropdown of what `concept create`
 * would actually accept, and choosing one reveals its optional fields and
 * legal lifecycle values, where the person is working. Without it (the
 * fetch failed), the modal degrades to asking for the type as free text.
 */
export class CreateConceptModal extends Modal {
  private type = "";
  private title = "";
  private lifecycle = "";
  private fieldValues: Record<string, FieldValue> = {};
  private detailEl: HTMLElement | null = null;

  constructor(
    app: App,
    private readonly client: Never4gaClient,
    private readonly registry: TypeRegistry | null,
    private readonly folder: string,
    private readonly opened: (written: ConceptWritten) => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.titleEl.setText("Create concept here");
    this.contentEl.createEl("p", {
      text: `In ${this.folder === "" ? "the vault root" : this.folder}. Never4gA writes the frontmatter and refuses anything it would have to guess.`,
      cls: "setting-item-description",
    });

    const creatable = (this.registry?.types ?? []).filter((entry) => entry.creatable);
    if (creatable.length > 0) {
      new Setting(this.contentEl).setName("Type").addDropdown((dropdown) => {
        // A blank first entry, so the type is chosen rather than defaulted:
        // the alphabetically first type is nobody's usual intention.
        dropdown.addOption("", "Choose a type…");
        for (const entry of creatable) {
          dropdown.addOption(entry.name, entry.name);
        }
        dropdown.setValue("").onChange((value) => {
          this.type = value;
          this.renderTypeDetail(creatable.find((entry) => entry.name === value));
        });
      });
    } else {
      new Setting(this.contentEl).setName("Type").addText((text) => {
        text.setPlaceholder("resource, course_assignment, knowledge…").onChange((value) => {
          this.type = value.trim();
        });
      });
    }
    new Setting(this.contentEl).setName("Title").addText((text) => {
      text.onChange((value) => {
        this.title = value.trim();
      });
      text.inputEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          void this.submit();
        }
      });
    });
    this.detailEl = this.contentEl.createDiv();
    new Setting(this.contentEl).addButton((button) => {
      button.setButtonText("Create").setCta().onClick(() => void this.submit());
    });
  }

  /**
   * What the chosen type carries, rendered fresh on every change: a
   * lifecycle dropdown when the type declares legal values, then an input
   * per optional field -- a three-way choice for a boolean, text for the
   * rest. Values typed for one type do not survive switching
   * to another -- a `unit` meant for an assignment is not a `unit` for a
   * knowledge note.
   */
  private renderTypeDetail(spec: RegistryType | undefined): void {
    if (this.detailEl === null) {
      return;
    }
    this.detailEl.empty();
    this.lifecycle = "";
    this.fieldValues = {};
    if (spec === undefined) {
      return;
    }
    if (spec.lifecycle_values.length > 0) {
      new Setting(this.detailEl).setName("Lifecycle").addDropdown((dropdown) => {
        // Unset is legal: the service fills the type's own default. An empty
        // declared vocabulary never reaches here -- that means "any value
        // tolerated", and the field then has no dropdown to offer.
        dropdown.addOption("", "(default)");
        for (const value of spec.lifecycle_values) {
          dropdown.addOption(value, value);
        }
        dropdown.setValue("").onChange((value) => {
          this.lifecycle = value;
        });
      });
    }
    for (const field of spec.optional_fields) {
      const setting = new Setting(this.detailEl).setName(field.name);
      if (field.kind === "boolean") {
        setting.addDropdown((dropdown) => {
          // Unset is a third answer, not false: leaving the field out lets
          // the type's own default apply.
          dropdown.addOption("", "(unset)");
          dropdown.addOption("true", "true");
          dropdown.addOption("false", "false");
          dropdown.setValue("").onChange((value) => {
            this.fieldValues[field.name] = booleanChoice(value);
          });
        });
        continue;
      }
      setting.addText((text) => {
        if (field.kind !== null) {
          text.setPlaceholder(field.kind);
        }
        text.onChange((value) => {
          this.fieldValues[field.name] = value;
        });
      });
    }
  }

  private async submit(): Promise<void> {
    if (this.type === "" || this.title === "") {
      new Notice("A type and a title are both needed.");
      return;
    }
    const fields = conceptFields(this.fieldValues, this.lifecycle);
    try {
      const written = await this.client.createConcept({
        type: this.type,
        title: this.title,
        ...(this.folder === "" ? {} : { folder: this.folder }),
        ...(Object.keys(fields).length > 0 ? { fields } : {}),
      });
      this.close();
      if (written.placement) {
        new Notice(written.placement);
      }
      this.opened(written);
    } catch (error) {
      // The service's refusal names what to fix; the modal stays open so the
      // person can fix it.
      failureNotice(error);
    }
  }
}

/**
 * Adopt the active note. Tried without a type first -- the folder usually
 * decides -- and when the service refuses to guess, its refusal is shown and
 * the person names the type. The service message is the UI: it already lists
 * the candidates.
 */
export async function adoptNote(
  app: App,
  client: Never4gaClient,
  path: string,
  done: (written: ConceptWritten) => void,
): Promise<void> {
  try {
    done(await client.adoptConcept({ path }));
  } catch (error) {
    if (error instanceof ApiError && error.code === "concept_not_adopted") {
      new AdoptTypeModal(app, client, path, error.message, error.candidates, done).open();
      return;
    }
    failureNotice(error);
  }
}

class AdoptTypeModal extends Modal {
  private type: string;

  constructor(
    app: App,
    private readonly client: Never4gaClient,
    private readonly path: string,
    private readonly refusal: string,
    /** The registered types the service says this could be, as data. */
    private readonly candidates: string[],
    private readonly done: (written: ConceptWritten) => void,
  ) {
    super(app);
    this.type = candidates[0] ?? "";
  }

  override onOpen(): void {
    this.titleEl.setText("Adopt this note");
    this.contentEl.createEl("p", { text: this.refusal, cls: "setting-item-description" });

    const setting = new Setting(this.contentEl).setName("Type");
    if (this.candidates.length > 0) {
      // The service sent the options, so offer them. Free text here would ask
      // the reader to retype a word the refusal already knows.
      setting.addDropdown((dropdown) => {
        for (const candidate of this.candidates) {
          dropdown.addOption(candidate, candidate);
        }
        dropdown.setValue(this.type).onChange((value) => {
          this.type = value;
        });
      });
    } else {
      setting.addText((text) => {
        text.onChange((value) => {
          this.type = value.trim();
        });
        text.inputEl.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            void this.submit();
          }
        });
      });
    }
    new Setting(this.contentEl).addButton((button) => {
      button.setButtonText("Adopt").setCta().onClick(() => void this.submit());
    });
  }

  private async submit(): Promise<void> {
    if (this.type === "") {
      new Notice("Name the type the refusal asks for.");
      return;
    }
    try {
      const written = await this.client.adoptConcept({ path: this.path, type: this.type });
      this.close();
      this.done(written);
    } catch (error) {
      failureNotice(error);
    }
  }
}
