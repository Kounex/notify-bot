import { SlashCommandOptionsOnlyBuilder } from '@discordjs/builders';
import {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
} from 'discord.js';

export default interface Command {
  readonly slashCommand: SlashCommandOptionsOnlyBuilder;
  readonly handledButtonIds?: readonly string[];
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  handleButtonInteraction?: (interaction: ButtonInteraction) => Promise<void>;
  handleAutocompleteInteraction?: (
    interaction: AutocompleteInteraction
  ) => Promise<void>;
}
