import { Autowired, Component, PostConstruct } from '@ag-grid-community/core';
import type { AgGroupComponentParams } from '@ag-grid-enterprise/core';
import { AgGroupComponent } from '@ag-grid-enterprise/core';

import { AgColorPicker } from '../../../../../widgets/agColorPicker';
import { AgSlider } from '../../../../../widgets/agSlider';
import type { ChartTranslationService } from '../../../services/chartTranslationService';
import type { ChartMenuParamsFactory } from '../../chartMenuParamsFactory';

export class WhiskersPanel extends Component {
    public static TEMPLATE /* html */ = `<div>
            <ag-group-component ref="whiskersGroup">
                <ag-color-picker ref="whiskerColorPicker"></ag-color-picker>
                <ag-slider ref="whiskerThicknessSlider"></ag-slider>
                <ag-slider ref="whiskerOpacitySlider"></ag-slider>
                <ag-slider ref="whiskerLineDashSlider"></ag-slider>
                <ag-slider ref="whiskerLineDashOffsetSlider"></ag-slider>
            </ag-group-component>
        </div>`;

    @Autowired('chartTranslationService') private readonly chartTranslationService: ChartTranslationService;

    constructor(private readonly chartMenuUtils: ChartMenuParamsFactory) {
        super();
    }

    @PostConstruct
    private init() {
        const whiskersGroupParams: AgGroupComponentParams = {
            cssIdentifier: 'charts-format-sub-level',
            direction: 'vertical',
            title: this.chartTranslationService.translate('whisker'),
            enabled: true,
            suppressOpenCloseIcons: true,
            suppressEnabledCheckbox: true,
        };
        this.setTemplate(WhiskersPanel.TEMPLATE, [AgGroupComponent, AgColorPicker, AgSlider], {
            whiskersGroup: whiskersGroupParams,
            whiskerColorPicker: this.chartMenuUtils.getDefaultColorPickerParams('whisker.stroke'),
            whiskerThicknessSlider: this.chartMenuUtils.getDefaultSliderParams(
                'whisker.strokeWidth',
                'strokeWidth',
                10
            ),
            whiskerOpacitySlider: this.chartMenuUtils.getDefaultSliderParams(
                'whisker.strokeOpacity',
                'strokeOpacity',
                1
            ),
            whiskerLineDashSlider: this.chartMenuUtils.getDefaultSliderParams('whisker.lineDash', 'lineDash', 30, true),
            whiskerLineDashOffsetSlider: this.chartMenuUtils.getDefaultSliderParams(
                'whisker.lineDashOffset',
                'lineDashOffset',
                30
            ),
        });
    }
}
