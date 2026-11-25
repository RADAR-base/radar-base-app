import type { ScreenBlueprint } from '../../../contracts/BlueprintSchema';
import type { NodeProps } from '../../types';

/** The page a data card's arrow opens when it has no `viewPath` of its own. */
export const DATA_DETAIL_VIEW = 'dataDetail';

/** The built-in page for {@link DATA_DETAIL_VIEW}: the card's title, and its detail to come. */
export function dataDetailBlueprint(title: string): ScreenBlueprint {
  return {
    blueprintVersion: '1',
    root: { id: 'root_data_detail', type: 'ViewNode', title, children: [] },
  } as ScreenBlueprint;
}

/** Opens a data card's page: its own `viewPath`, else the standard detail page. */
export function openDataDetail(context: NodeProps['context'], title: string, viewPath?: string) {
  context.dispatch({ type: 'OpenCustomView', viewUrl: viewPath ?? DATA_DETAIL_VIEW, params: { title } });
}
