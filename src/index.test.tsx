import { createRef, forwardRef, memo } from 'react';
import { render, screen } from '@testing-library/react';

import { isBuildConditions, setBuildConditions, switchBuildCondition } from './index';
import { resetBuildConditionsStorage } from './testing';

beforeEach(() => {
    resetBuildConditionsStorage();
});

describe('switchBuildCondition', () => {
    describe('функции', () => {
        it('выбирает функцию по условию', () => {
            const fn = switchBuildCondition({
                desktop: (x: number) => x * 2,
                mobile: (x: number) => x * 3,
            });

            setBuildConditions({ platform: 'desktop' });
            expect(fn(5)).toBe(10);

            setBuildConditions({ platform: 'mobile' });
            expect(fn(5)).toBe(15);
        });

        it('динамически переключается без пересоздания', () => {
            const callCount = { desktop: 0, mobile: 0 };

            const fn = switchBuildCondition({
                desktop: () => {
                    callCount.desktop++;

                    return 'desk';
                },
                mobile: () => {
                    callCount.mobile++;

                    return 'mob';
                },
            });

            setBuildConditions({ platform: 'desktop' });
            expect(fn()).toBe('desk');
            expect(fn()).toBe('desk');

            setBuildConditions({ platform: 'mobile' });
            expect(fn()).toBe('mob');

            expect(callCount).toEqual({ desktop: 2, mobile: 1 });
        });

        it('пробрасывает this', () => {
            const fn = switchBuildCondition({
                desktop: function (this: { value: number }) {
                    return this.value;
                },
                mobile: function (this: { value: number }) {
                    return this.value * 2;
                },
            });

            setBuildConditions({ platform: 'desktop' });
            expect(fn.call({ value: 10 })).toBe(10);

            setBuildConditions({ platform: 'mobile' });
            expect(fn.call({ value: 10 })).toBe(20);
        });
    });

    describe('React function component', () => {
        it('рендерит компонент по условию', () => {
            const Desktop = () => <div data-testid="result">desktop</div>;
            const Mobile = () => <div data-testid="result">mobile</div>;

            const Component = switchBuildCondition({ desktop: Desktop, mobile: Mobile });

            setBuildConditions({ platform: 'desktop' });
            const { unmount } = render(<Component />);
            expect(screen.getByTestId('result')).toHaveTextContent('desktop');
            unmount();

            setBuildConditions({ platform: 'mobile' });
            render(<Component />);
            expect(screen.getByTestId('result')).toHaveTextContent('mobile');
        });

        it('передаёт пропсы', () => {
            const Desktop = ({ name }: { name: string }) => <span>{name}-desktop</span>;
            const Mobile = ({ name }: { name: string }) => <span>{name}-mobile</span>;

            const Component = switchBuildCondition({ desktop: Desktop, mobile: Mobile });

            setBuildConditions({ platform: 'desktop' });
            const { container } = render(<Component name="test" />);
            expect(container.textContent).toBe('test-desktop');
        });
    });

    describe('React.memo()', () => {
        it('рендерит memo-компоненты', () => {
            const Desktop = memo(() => <div data-testid="memo">memo-desktop</div>);
            const Mobile = memo(() => <div data-testid="memo">memo-mobile</div>);

            const Component = switchBuildCondition({ desktop: Desktop, mobile: Mobile });

            setBuildConditions({ platform: 'desktop' });
            const { unmount } = render(<Component />);
            expect(screen.getByTestId('memo')).toHaveTextContent('memo-desktop');
            unmount();

            setBuildConditions({ platform: 'mobile' });
            render(<Component />);
            expect(screen.getByTestId('memo')).toHaveTextContent('memo-mobile');
        });

        it('мемоизация работает при повторном рендере', () => {
            let renderCount = 0;
            const Inner = memo(({ value }: { value: string }) => {
                renderCount++;

                return <div data-testid="memo-count">{value}</div>;
            });

            const Component = switchBuildCondition({ desktop: Inner, mobile: Inner });

            setBuildConditions({ platform: 'desktop' });
            const { rerender } = render(<Component value="hello" />);
            expect(renderCount).toBe(1);

            rerender(<Component value="hello" />);
            expect(renderCount).toBe(1);
        });
    });

    describe('React.forwardRef()', () => {
        it('рендерит и пробрасывает ref', () => {
            const Desktop = forwardRef<HTMLDivElement, { text: string }>(({ text }, ref) => (
                <div ref={ref} data-testid="fref">
                    {text}-desktop
                </div>
            ));
            const Mobile = forwardRef<HTMLDivElement, { text: string }>(({ text }, ref) => (
                <div ref={ref} data-testid="fref">
                    {text}-mobile
                </div>
            ));

            const Component = switchBuildCondition({ desktop: Desktop, mobile: Mobile });

            setBuildConditions({ platform: 'desktop' });
            const ref = createRef<HTMLDivElement>();
            render(<Component text="test" ref={ref} />);

            expect(screen.getByTestId('fref')).toHaveTextContent('test-desktop');
            expect(ref.current).toBeInstanceOf(HTMLDivElement);
        });
    });

    describe('memo(forwardRef())', () => {
        it('рендерит и пробрасывает ref', () => {
            const Desktop = memo(
                forwardRef<HTMLButtonElement, { label: string }>(({ label }, ref) => (
                    <button ref={ref} data-testid="mfr">
                        {label}-desktop
                    </button>
                ))
            );
            const Mobile = memo(
                forwardRef<HTMLButtonElement, { label: string }>(({ label }, ref) => (
                    <button ref={ref} data-testid="mfr">
                        {label}-mobile
                    </button>
                ))
            );

            const Component = switchBuildCondition({ desktop: Desktop, mobile: Mobile });

            setBuildConditions({ platform: 'mobile' });
            const ref = createRef<HTMLButtonElement>();
            render(<Component label="btn" ref={ref} />);

            expect(screen.getByTestId('mfr')).toHaveTextContent('btn-mobile');
            expect(ref.current).toBeInstanceOf(HTMLButtonElement);
        });
    });

    describe('объекты (CSS Modules)', () => {
        it('проксирует доступ к свойствам', () => {
            const desktopStyles = { root: 'root_desktop', title: 'title_desktop' };
            const mobileStyles = { root: 'root_mobile', title: 'title_mobile' };

            const styles = switchBuildCondition({ desktop: desktopStyles, mobile: mobileStyles });

            setBuildConditions({ platform: 'desktop' });
            expect(styles.root).toBe('root_desktop');
            expect(styles.title).toBe('title_desktop');

            setBuildConditions({ platform: 'mobile' });
            expect(styles.root).toBe('root_mobile');
        });

        it('оператор in', () => {
            const styles = switchBuildCondition({
                desktop: { root: 'a', extra: 'b' },
                mobile: { root: 'c' },
            });

            setBuildConditions({ platform: 'desktop' });
            expect('extra' in styles).toBe(true);

            setBuildConditions({ platform: 'mobile' });
            expect('extra' in styles).toBe(false);
        });

        it('Object.keys', () => {
            const styles = switchBuildCondition({
                desktop: { a: '1', b: '2', c: '3' },
                mobile: { x: '1' },
            });

            setBuildConditions({ platform: 'desktop' });
            expect(Object.keys(styles)).toEqual(['a', 'b', 'c']);

            setBuildConditions({ platform: 'mobile' });
            expect(Object.keys(styles)).toEqual(['x']);
        });
    });

    describe('default', () => {
        it('fallback на default если условие не совпало', () => {
            const fn = switchBuildCondition({
                default: () => 'default-result',
                server: () => 'server-result',
            });

            setBuildConditions({ runtime: 'server' });
            expect(fn()).toBe('server-result');

            setBuildConditions({ runtime: 'client' });
            expect(fn()).toBe('default-result');
        });

        it('прямое условие имеет приоритет над default', () => {
            const fn = switchBuildCondition({
                default: () => 'fallback',
                desktop: () => 'desk',
            });

            setBuildConditions({ platform: 'desktop' });
            expect(fn()).toBe('desk');

            setBuildConditions({ platform: 'mobile' });
            expect(fn()).toBe('fallback');
        });

        it('бросает ошибку если нет ни совпадения, ни default', () => {
            const fn = switchBuildCondition({ desktop: () => 'ok' });

            setBuildConditions({ platform: 'mobile' });
            expect(() => fn()).toThrow('нет значения для текущих условий');
        });
    });

    describe('вложенные switchBuildCondition', () => {
        const createComponent = () =>
            switchBuildCondition({
                client: switchBuildCondition({
                    desktop: () => <div data-testid="page">PageWithStub</div>,
                    default: () => <div data-testid="page">Empty</div>,
                }),
                default: () => <div data-testid="page">stub</div>,
            });

        it('runtime=client, platform=desktop → PageWithStub', () => {
            const Component = createComponent();

            setBuildConditions({ runtime: 'client', platform: 'desktop' });
            const { unmount } = render(<Component />);
            expect(screen.getByTestId('page')).toHaveTextContent('PageWithStub');
            unmount();
        });

        it('runtime=client, platform=mobile → Empty (default внутреннего)', () => {
            const Component = createComponent();

            setBuildConditions({ runtime: 'client', platform: 'mobile' });
            const { unmount } = render(<Component />);
            expect(screen.getByTestId('page')).toHaveTextContent('Empty');
            unmount();
        });

        it('runtime=server → stub (default внешнего)', () => {
            const Component = createComponent();

            setBuildConditions({ runtime: 'server', platform: 'desktop' });
            const { unmount } = render(<Component />);
            expect(screen.getByTestId('page')).toHaveTextContent('stub');
            unmount();
        });

        it('динамическое переключение вложенных условий', () => {
            const Component = createComponent();

            setBuildConditions({ runtime: 'client', platform: 'desktop' });
            const { unmount: u1 } = render(<Component />);
            expect(screen.getByTestId('page')).toHaveTextContent('PageWithStub');
            u1();

            setBuildConditions({ platform: 'mobile' });
            const { unmount: u2 } = render(<Component />);
            expect(screen.getByTestId('page')).toHaveTextContent('Empty');
            u2();

            setBuildConditions({ runtime: 'server' });
            const { unmount: u3 } = render(<Component />);
            expect(screen.getByTestId('page')).toHaveTextContent('stub');
            u3();
        });
    });

    describe('типизация: однородность и группы', () => {
        it('однородные функции — допустимо', () => {
            const result = switchBuildCondition({
                desktop: (x: number) => x * 2,
                mobile: (x: number) => x * 3,
            });
            setBuildConditions({ platform: 'desktop' });
            expect(result(1)).toBe(2);
        });

        it('однородные объекты — допустимо', () => {
            const result = switchBuildCondition({
                desktop: { root: 'a' },
                mobile: { root: 'b' },
            });
            setBuildConditions({ platform: 'desktop' });
            expect(result.root).toBe('a');
        });

        it('смешение функции и объекта — ошибка типизации', () => {
            const obj = { root: 'a' };
            const fn = () => 'b';

            // @ts-expect-error — нельзя смешивать функции и объекты
            switchBuildCondition({ desktop: obj, mobile: fn });
        });

        it('смешение memo и обычной функции — ошибка типизации', () => {
            const Memo = memo(() => <div>m</div>);
            const Fn = () => <div>f</div>;

            // @ts-expect-error — memo (объект) + function нельзя смешивать
            switchBuildCondition({ desktop: Memo, mobile: Fn });
        });

        it('смешение групп в одной карте — ошибка типизации', () => {
            const Desktop = () => <div>d</div>;
            const Server = () => <div>s</div>;

            // @ts-expect-error — ключи desktop и server из разных групп
            switchBuildCondition({ desktop: Desktop, server: Server });
        });

        it('примитивы запрещены', () => {
            // @ts-expect-error — строки не являются AllowedValue
            switchBuildCondition({ desktop: 'hello', mobile: 'world' });
        });
    });
});

describe('isBuildConditions', () => {
    it('true, если условие активно', () => {
        setBuildConditions({ platform: 'desktop' });
        expect(isBuildConditions('desktop')).toBe(true);
        expect(isBuildConditions('mobile')).toBe(false);
    });

    it('несколько условий — true только если активны все', () => {
        setBuildConditions({ platform: 'desktop', runtime: 'client' });
        expect(isBuildConditions(['desktop', 'client'])).toBe(true);
        expect(isBuildConditions(['desktop', 'server'])).toBe(false);
    });

    it('два значения одной группы запрещены типами', () => {
        setBuildConditions({ platform: 'desktop' });
        // @ts-expect-error — desktop и mobile из одной группы
        expect(isBuildConditions(['desktop', 'mobile'])).toBe(false);
    });

    it('бросает ошибку, если условия не установлены', () => {
        // хранилище пусто — getBuildConditions выбрасывает ошибку
        expect(() => isBuildConditions('desktop')).toThrow();
    });
});
