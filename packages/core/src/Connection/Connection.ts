import { action, makeObservable, observable } from 'mobx';
import { Subject, Subscription, combineLatest, lastValueFrom, map } from 'rxjs';
import { v4 as uuid } from 'uuid';
import { ZodType, ZodUnion } from 'zod';

import { Input } from '../Input/Input';
import { Output } from '../Output/Output';

export class Connection<T> extends Subject<T> {
    /** Identifier */
    public id: string = uuid();
    /** Output */
    public from: Output<T>;
    /** Input */
    public to: Input<T>;
    /** Subscription */
    public subscription: Subscription;

    /** Determines type compatibility */
    public static isTypeCompatible<TFrom, TTo>(from: Output<TFrom>, to: Input<TTo>) {
        if (to.type.validator instanceof ZodUnion) {
            const types = to.type.validator._def.options as ZodType[];
            const hasCompatibleType = types.some(type => type.constructor === from.type.validator.constructor);

            return hasCompatibleType;
        } else {
            return from.type.validator.constructor === to.type.validator.constructor;
        }
    }

    constructor(from: Output<T>, to: Input<T>) {
        super();

        if (!Connection.isTypeCompatible(from, to)) {
            throw new Error('Connection origin & target has incompatible types');
        }

        if (to.connected) {
            /** Remove previous connection gracefully */
            to.connection?.dispose();
        }

        this.from = from;
        this.to = to;
        this.from.connections.push(this);
        this.to.connection = this;

        this.subscription = this.from.subscribe(value => {
            try {
                this.to.type.validator.parse(value);
                this.to.next(value);
            } catch (err) {
                this.dispose();
                throw new Error('Received a value with an incompatible type');
            }
        });

        makeObservable(this, {
            id: observable,
            from: observable,
            to: observable,
            subscription: observable,
            dispose: action
        });
    }

    /** Disposes the Connection */
    public dispose() {
        this.unsubscribe();
        this.subscription?.unsubscribe();

        this.from.connections = this.from.connections.filter(connection => connection !== this);
        this.to.connection = null;

        this.to.next(this.to.defaultValue);
    }
}
