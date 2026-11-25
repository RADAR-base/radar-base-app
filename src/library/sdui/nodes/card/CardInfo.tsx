import React, { useState } from 'react';
import { Pressable } from 'react-native';
import InfoIcon from '../../../../theme/icons/infofilled.svg';
import { getColorTokens } from '../../../../theme/theme';
import { ModalHeader, ModalShell, modalMuted } from '../../ModalShell';
import { ModalInfoRows, type InfoRowSpec } from '../../ModalInfoRow';
import type { NodeProps } from '../../types';

/**
 * Which icon a data card's header shows: the arrow with `showOpenButton: true` (or a `viewPath`,
 * unless it's `false`), opening its detail page; otherwise the ⓘ.
 */
export function headerIcons(info: string | undefined, viewPath: string | undefined, showOpenButton: unknown) {
  const showOpen = showOpenButton === true || (!!viewPath && showOpenButton !== false);
  return { showInfo: !!info && !showOpen, showOpen };
}

/** The ⓘ beside a data card's title, opening its `info` in a dialog; `rows` explain its parts. */
export function CardInfo({
  title,
  info,
  color,
  context,
  rows,
}: {
  title: string;
  info: string;
  color: string;
  context: NodeProps['context'];
  rows?: InfoRowSpec[];
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const mode = context.colorScheme ?? 'light';
  const brandColors = context.theme.brandColors;

  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`About ${title}`} onPress={() => setOpen(true)} hitSlop={10}>
        <InfoIcon width={18} height={18} color={color} />
      </Pressable>
      <ModalShell visible={open} onClose={close} brandColors={context.theme.brandColors}>
        <ModalHeader
          title={title}
          subtitle={info}
          onClose={close}
          brandColors={context.theme.brandColors}
          style={rows?.length ? undefined : { marginBottom: 0 }}
        />
        {!!rows?.length && (
          <ModalInfoRows rows={rows} text={getColorTokens(mode, brandColors).text.primary} muted={modalMuted(mode, brandColors)} />
        )}
      </ModalShell>
    </>
  );
}
